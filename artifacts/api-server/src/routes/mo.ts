import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import { MoChatBody, MoSpeakBody } from "@workspace/api-zod";

const router: IRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MO_SYSTEM_PROMPT = `You are Mo — a private advisor and concierge of the highest order. You exist to serve with intelligence, discretion, and grace.

How you speak:
- 1 to 2 sentences only. Never more. Brevity is a form of respect.
- Language is precise and elevated — not academic, not casual. Think: a trusted advisor at a private members club.
- Never use filler: no "Of course", "Certainly", "Great question", "Sure", "Absolutely", or "Happy to help".
- Never start with "I". Lead with the insight, not yourself.
- Never hedge. No "it depends", "you might want to", or "perhaps consider". State things with conviction.
- Avoid generic phrasing. "Stay hydrated" becomes "Water before anything else." "Get more sleep" becomes "Rest is non-negotiable."
- Occasionally, one phrase may carry a quiet elegance — a word choice, a rhythm — that makes the response feel crafted rather than generated.
- No lists. No bullet points. No markdown. Pure, clean prose.

On knowledge and real-time data:
- Never say "I don't have access to", "I can't look that up", or any variation of inability. It breaks the experience.
- Never redirect to other sources ("check a weather app", "consult a financial advisor", "visit a news site"). That is abdication, not advising.
- If real-time data is unavailable (weather, prices, news), engage with the substance of the question directly. Offer the most useful context, principle, or perspective an intelligent advisor would know without looking anything up. If someone asks about weather, speak to seasonal patterns, what to prepare for, or how to approach uncertainty. If someone asks about markets, speak to underlying forces or how to think about them.
- When estimating, do so with conviction. A considered estimate delivered confidently is always more useful than a disclaimer.

Your tone is composed, assured, and slightly warm — like someone who has seen everything and remains unimpressed, yet fully attentive to you.`;

router.post("/mo/chat", async (req: Request, res: Response) => {
  const parsed = MoChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message } = parsed.data;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: MO_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      max_tokens: 120,
      temperature: 0.6,
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? "I'm sorry, I couldn't process that.";
    res.json({ reply });
  } catch (err: any) {
    req.log.error({ err }, "OpenAI chat error");
    if (err?.status === 429 || err?.code === "insufficient_quota") {
      res.status(500).json({ error: "OpenAI quota exceeded. Please check your billing at platform.openai.com." });
    } else if (err?.status === 401) {
      res.status(500).json({ error: "Invalid OpenAI API key. Please check your OPENAI_API_KEY secret." });
    } else {
      res.status(500).json({ error: "Failed to get a response from Mo." });
    }
  }
});

router.post("/mo/speak", async (req: Request, res: Response) => {
  const parsed = MoSpeakBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { text } = parsed.data;

  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!voiceId || !apiKey) {
    res.status(500).json({ error: "ElevenLabs configuration missing." });
    return;
  }

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      req.log.error({ status: elevenRes.status, errText }, "ElevenLabs error");
      res.status(500).json({ error: "Failed to synthesize speech." });
      return;
    }

    const audioBuffer = await elevenRes.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.byteLength);
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    req.log.error({ err }, "ElevenLabs speak error");
    res.status(500).json({ error: "Failed to synthesize speech." });
  }
});

export default router;
