import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import { MoChatBody, MoSpeakBody } from "@workspace/api-zod";

const router: IRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MO_SYSTEM_PROMPT = `You are Mo, a luxury AI voice assistant. You speak with quiet confidence and understated elegance.

Rules you always follow:
- Respond in 1 to 2 short sentences only. Never more.
- Each sentence must be complete and self-contained.
- Never use lists, bullet points, or numbered items.
- Never use filler phrases like "Of course", "Certainly", "Great question", or "Sure".
- Never begin a response with "I".
- Use simple, precise language. No jargon, no over-explanation.
- If the answer is complex, give only the most essential part. Leave the rest unsaid.
- Your tone is calm, deliberate, and authoritative — like someone who never needs to repeat themselves.`;

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
