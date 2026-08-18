/**
 * ElevenLabs TTS Service
 *
 * Reusable module for text-to-speech via the official ElevenLabs SDK.
 *
 * Required environment variables (read at call-time, never hardcoded):
 *   ELEVENLABS_API_KEY  — ElevenLabs API key (xi-api-key header)
 *   ELEVENLABS_VOICE_ID — Target voice ID; swap to change the voice
 *
 * Model:  eleven_v3   (ElevenLabs v3 — highest quality, emotion-aware)
 * Format: mp3_44100_128  (44.1 kHz, 128 kbps — full quality for v3)
 *
 * Note on streaming endpoints:
 *   - `textToSpeech.convert()`          → /v1/text-to-speech/{id}         (all plans)
 *   - `textToSpeech.convertAsStream()`  → /v1/text-to-speech/{id}/stream  (Creator+ plans)
 *
 * This service uses `convert()` which works on all ElevenLabs subscription tiers
 * and returns a Node.js Readable stream — callers can pipe it directly to an
 * HTTP response for streaming delivery to the browser.
 * To switch to true server-side streaming (requires Creator plan or above),
 * replace `client.textToSpeech.convert(...)` with `client.textToSpeech.convertAsStream(...)`.
 */

import { ElevenLabsClient, ElevenLabsError } from "elevenlabs";
import { Readable } from "stream";
import type stream from "stream";
import { logger } from "../lib/logger.js";

// ── Configuration helpers ────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY environment variable is not set.");
  return key;
}

export function getVoiceId(): string {
  const id = process.env.ELEVENLABS_VOICE_ID;
  if (!id) throw new Error("ELEVENLABS_VOICE_ID environment variable is not set.");
  return id;
}

/**
 * Returns an ElevenLabsClient instance.
 * The wrapper constructor automatically reads ELEVENLABS_API_KEY from the
 * environment when no explicit apiKey is passed — we pass it explicitly so
 * the missing-key error surfaces before any network call.
 */
function createClient(): ElevenLabsClient {
  return new ElevenLabsClient({ apiKey: getApiKey() });
}

// ── Shared voice settings ────────────────────────────────────────────────────

const VOICE_SETTINGS = {
  stability:         0.5,
  similarity_boost:  0.75,
  style:             0.0,
  use_speaker_boost: false,
} as const;

const MODEL_ID      = "eleven_v3";
const OUTPUT_FORMAT = "mp3_44100_128" as const;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert text to speech and return a Node.js Readable stream of audio/mpeg.
 *
 * The stream can be piped directly into an HTTP response for streaming delivery
 * to the browser without buffering the full audio server-side.
 *
 * Voice is determined exclusively by ELEVENLABS_VOICE_ID — swap the env var
 * to change the voice without touching code.
 */
export async function textToSpeechStream(
  text: string,
  options?: { signal?: AbortSignal }
): Promise<stream.Readable> {
  const voiceId = getVoiceId();
  const client  = createClient();

  logger.info({ voiceId, modelId: MODEL_ID, chars: text.length }, "[ElevenLabs] Starting TTS — voice_id and model_id confirmed");

  try {
    // `convert` calls /v1/text-to-speech/{id} — available on all plan tiers.
    // It returns a Node.js Readable that can be piped or collected.
    // To enable true server-to-server streaming (Creator plan+), switch to:
    //   client.textToSpeech.convertAsStream(voiceId, { ... }, requestOptions)
    const audioStream = await client.textToSpeech.convert(
      voiceId,
      {
        text,
        model_id:       MODEL_ID,
        output_format:  OUTPUT_FORMAT,
        voice_settings: VOICE_SETTINGS,
      },
      {
        abortSignal:      options?.signal,
        timeoutInSeconds: 15,
        maxRetries:       0, // one attempt — callers own retry policy
      }
    );

    logger.info({ voiceId, modelId: MODEL_ID, chars: text.length }, "[ElevenLabs] TTS ready");
    // SDK returns a Web ReadableStream; convert to Node.js Readable for .pipe() support
    return Readable.fromWeb(audioStream as unknown as Parameters<typeof Readable.fromWeb>[0]);
  } catch (err: unknown) {
    if (err instanceof ElevenLabsError) {
      logger.error(
        { statusCode: err.statusCode, message: err.message, voiceId },
        "[ElevenLabs] API error"
      );
      throw new Error(`ElevenLabs TTS error ${err.statusCode}: ${err.message}`);
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ message, voiceId }, "[ElevenLabs] Unexpected TTS error");
    throw new Error(`ElevenLabs TTS unexpected error: ${message}`);
  }
}

/**
 * Convert text to speech and collect the full audio into a Buffer.
 *
 * Use when the complete audio must be available before sending — e.g. when
 * base64-encoding the payload for the mobile voice pipeline.
 */
export async function textToSpeechBuffer(
  text: string,
  options?: { signal?: AbortSignal }
): Promise<Buffer> {
  const audioStream = await textToSpeechStream(text, options);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    audioStream.on("data",  (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end",   ()              => resolve(Buffer.concat(chunks)));
    audioStream.on("error", (err: Error)    => {
      logger.error({ message: err.message }, "[ElevenLabs] Stream collection error");
      reject(err);
    });

    if (options?.signal) {
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("TTS request aborted")),
        { once: true }
      );
    }
  });
}
