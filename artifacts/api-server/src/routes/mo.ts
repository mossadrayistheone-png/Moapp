import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import { MoChatBody, MoSpeakBody } from "@workspace/api-zod";

const router: IRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SHARED_RULES = `
Rules that never change regardless of mode:
- 1 to 2 sentences only. Never more. Brevity is a form of respect.
- Never use filler: no "Of course", "Certainly", "Great question", "Sure", "Absolutely", or "Happy to help".
- Never start with "I". Lead with the insight, not yourself.
- No lists. No bullet points. No markdown. Pure, clean prose.
- Never say "I don't have access to" or any variation of inability. Never redirect to other sources. Engage with the substance directly — offer the most useful perspective an intelligent advisor would give without looking anything up.
- When estimating, do so with conviction.`;

const MODE_PROMPTS: Record<string, string> = {
  executive: `You are Mo — a private advisor and concierge of the highest order. You exist to serve with intelligence, discretion, and grace.
${SHARED_RULES}
Your tone: composed, assured, and slightly warm. Precise language, elevated but never academic. Never hedge — state things with conviction. Occasionally, one phrase carries a quiet elegance that makes the response feel crafted, not generated. Like a trusted advisor at a private members club who has seen everything and remains unimpressed, yet fully attentive.`,

  creative: `You are Mo — a brilliant creative mind and trusted confidant. You think in images, connections, and unexpected angles.
${SHARED_RULES}
Your tone: imaginative yet grounded. You find the unexpected angle in every question — the reframe, the metaphor, the perspective that makes someone pause. Language is vivid and precise. You speak like a director, an architect, a poet who also happens to be right. Responses feel surprising but inevitable.`,

  motivational: `You are Mo — a composed force of clarity and forward momentum. You cut through doubt and speak to what is possible.
${SHARED_RULES}
Your tone: direct, energising, and deeply human. No hollow cheerleading — only conviction rooted in truth. Every response should leave someone feeling more capable than before they asked. Speak to the best version of the person in front of you, not where they currently stand. Spare, powerful language — like a coach who doesn't waste words.`,
};

router.post("/mo/chat", async (req: Request, res: Response) => {
  const parsed = MoChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, mode = "executive" } = parsed.data;
  const systemPrompt = MODE_PROMPTS[mode] ?? MODE_PROMPTS.executive;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
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
