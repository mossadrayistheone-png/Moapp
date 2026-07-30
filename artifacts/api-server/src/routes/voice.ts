/**
 * POST /voice  — Simple text-to-speech endpoint
 *
 * Request body:  { "text": "Text to speak" }
 * Response:      audio/mpeg stream (supports HTTP streaming via pipe)
 *
 * Environment variables used:
 *   ELEVENLABS_API_KEY  — ElevenLabs API key
 *   ELEVENLABS_VOICE_ID — Target voice ID (swap to change the voice)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { textToSpeechStream } from "../services/elevenlabs.js";

const router: IRouter = Router();

router.post("/voice", async (req: Request, res: Response) => {
  const { text } = req.body ?? {};

  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty 'text' string." });
    return;
  }
  if (text.length > 5000) {
    res.status(400).json({ error: "text too long — maximum 5000 characters." });
    return;
  }

  // Client-side abort propagates into the SDK request
  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  req.log.info({ chars: text.length }, "POST /voice — TTS request");

  try {
    const audioStream = await textToSpeechStream(text, { signal: abortController.signal });

    // Stream audio directly to the response — no buffering required
    res.setHeader("Content-Type",        "audio/mpeg");
    res.setHeader("Transfer-Encoding",   "chunked");
    res.setHeader("Cache-Control",       "no-cache");
    res.setHeader("X-Voice-Model",       "eleven_turbo_v2_5");
    res.setHeader("X-Output-Format",     "mp3_22050_32");

    audioStream.pipe(res);

    audioStream.on("error", (err: Error) => {
      req.log.error({ message: err.message }, "POST /voice — stream error");
      if (!res.headersSent) {
        res.status(502).json({ error: "TTS stream failed." });
      } else {
        res.destroy();
      }
    });

    audioStream.on("end", () => {
      req.log.info({ chars: text.length }, "POST /voice — stream complete");
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ message }, "POST /voice — TTS error");

    if (!res.headersSent) {
      if (message.includes("ELEVENLABS_API_KEY") || message.includes("ELEVENLABS_VOICE_ID")) {
        res.status(503).json({ error: "TTS service not configured. Check environment variables." });
      } else {
        res.status(502).json({ error: message });
      }
    }
  }
});

export default router;
