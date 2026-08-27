---
name: Mo text-chat TTS reuses voice-pipeline playback
description: How Mo's text-chat replies got spoken aloud via the same ElevenLabs playback path as voice replies, and the codegen/APK implications.
---

Text-chat (`/mo/chat`) originally returned only `reply` text — no TTS — while
voice-chat (`/mo/voice`) always synthesized + played audio. Fixed by:

- **Backend**: `/mo/chat` now also calls `textToSpeechBuffer` + `cacheAnswerAudio`
  (the same helpers `/mo/voice` uses) and returns `audioBase64`/`audioUrl`,
  wrapped in try/catch so a TTS failure degrades to text-only instead of
  breaking the chat response.
- **Client**: extracted the voice pipeline's inline answer-audio playback logic
  (https-URL-primary + base64-data-URI-fallback + stuck-playback safety timer)
  out of `use-voice.ts`'s pipeline function into two reusable pieces exported
  from `useVoice()`: `resolveAnswerAudioUri` (internal) and `speakAnswer(audioBase64?, audioUrl?)`
  (public). `useTextChat`'s `onComplete` callback gained a 4th argument
  (`{ audioBase64, audioUrl }`) so `index.tsx` can call `speakAnswer` after a
  text turn completes, respecting the same `autoplay` preference gate.

**Why:** duplicating the Android-hardened playback state machine (New
Architecture's MediaPlayer silently rejects local `file://` URIs) would have
been a second place for the same bugs to resurface. Single source of truth
means both input modes get identical Android reliability behavior for free.

**How to apply:** any new response-producing endpoint that should make Mo
"speak" should mirror this same pattern — synthesize server-side with graceful
degradation, then call the shared `speakAnswer` client-side rather than
reinventing playback.

**Codegen note:** `ChatResponse` in `lib/api-spec/openapi.yaml` gained optional
`audioBase64`/`audioUrl` fields — remember to run
`cd lib/api-spec && pnpm run codegen` after editing openapi.yaml, or the
`api-spec-drift` workflow will report drift (or, if generated files are
already dirty when it runs, it correctly refuses to check and asks you to
commit first — that refusal is not itself a drift failure).

**APK implication:** this project has no `expo-updates`/OTA path (checked
`app.json` — no such plugin). Any client-side JS change (like this one) only
reaches devices that already have the app installed after a brand-new APK
build + reinstall/update — mention this explicitly whenever a fix touches
`artifacts/mo-app` client code that's already shipped.
