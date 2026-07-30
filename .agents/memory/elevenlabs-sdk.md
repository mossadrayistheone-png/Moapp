---
name: ElevenLabs SDK integration
description: Details on using the official ElevenLabs SDK in this project, endpoint choice, and 403 diagnostics.
---

# ElevenLabs SDK integration

## Endpoint choice
- `client.textToSpeech.convert()` → `/v1/text-to-speech/{id}` — works on all plan tiers, returns `stream.Readable`
- `client.textToSpeech.convertAsStream()` → `/v1/text-to-speech/{id}/stream` — requires Creator plan or above; returns 403 on lower tiers

**Use `convert()` for compatibility.** Both return a Node.js Readable that can be piped to an HTTP response.

## Service location
`artifacts/api-server/src/services/elevenlabs.ts` — the single ElevenLabs module. Exports:
- `textToSpeechStream(text, options?)` → `stream.Readable` (pipe to response)
- `textToSpeechBuffer(text, options?)` → `Buffer` (for base64 encoding in mobile pipeline)
- `getVoiceId()` — reads `ELEVENLABS_VOICE_ID` from env

## Environment variables
- `ELEVENLABS_API_KEY` — ElevenLabs API key (xi-api-key header), read by service
- `ELEVENLABS_VOICE_ID` — voice ID, swap to change voice without touching code

## 403 diagnosis (if it recurs)
A 403 with empty body `{}` means ElevenLabs is rejecting the credentials, NOT a code bug.
The SDK sends the request identically to the original raw fetch (same URL, same xi-api-key header, same body).
Causes: API key expired/rotated, voice ID belongs to a different account, or account has no credits.
Fix: refresh `ELEVENLABS_API_KEY` and verify `ELEVENLABS_VOICE_ID` belongs to the same account.

## Why: the raw fetch was also removed
The old inline `elevenlabsTTS` raw fetch in `mo.ts` and `synthesizeSpeech` wrapper were both replaced with imports from the service module. All TTS calls now go through `services/elevenlabs.ts`.
