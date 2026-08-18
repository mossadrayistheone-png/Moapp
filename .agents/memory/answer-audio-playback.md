---
name: Answer audio playback on Android New Architecture
description: Why Mo's answer audio streams over https instead of playing local file:// URIs.
---

# Answer audio playback (Android New Architecture)

## The rule
Never play the TTS answer from a local `file://` URI on Android. Play the server's https URL (short-lived in-memory audio cache on the API server, `GET /api/mo/audio/:id`, ~5 min TTL), with a one-shot base64 `data:` URI fallback if the URL source never starts within the safety timeout.

**Why:** On New Architecture (Fabric, RN 0.81.x), expo-audio's underlying MediaPlayer can silently reject local `file://` URIs — playback never starts and the safety timeout fires every turn, leaving text-only responses.

**How to apply:** The voice hook selects the https URL when the API response includes `audioUrl`, keeps the data URI in a fallback ref, and the safety timer retries once with the data URI before giving up to idle. Web always uses the data URI.
