---
name: expo-audio VAD metering
description: How to read live mic level (dBFS) from expo-audio's AudioRecorder for voice-activity-detection polling loops.
---

`recorder.getStatus()` (called on the `AudioRecorder` returned by `useAudioRecorder`) is a real,
synchronous SDK method — it exists and matches the SDK's own internal usage. But calling it
ad hoc inside a hand-rolled `setInterval`, wrapped in a silent `catch {}`, is a footgun: any
failure (bad recorder state, a stale/released SharedObject, a native-side hiccup) is swallowed
with no log, and VAD/calibration logic silently falls back to defaults forever — indistinguishable
from "everything is fine, ambient noise happens to be zero samples."

**Fix pattern:** use the SDK's own `useAudioRecorderState(recorder, pollIntervalMs)` hook instead
of calling `recorder.getStatus()` directly. Mirror its returned `RecorderState` into a ref
(`recorderStateRef.current = recorderState` on every render, the same pattern already used for
`answerPlayerRef`) so synchronous code (VAD polling `setInterval`, ambient-calibration loop) can
read `recorderStateRef.current.metering` as a plain object property — that can never throw, so no
catch block is needed and no failure mode can hide silently.

**Why:** any time a hand-written polling loop needs a plain SDK value (metering, playback
position, etc.), prefer wrapping it in the SDK's documented hook and reading a ref, rather than
calling native accessor methods directly from arbitrary JS timers with defensive try/catch —
the latter tends to hide the very failures you'd need to see to debug it.

**How to apply:** any future expo-audio VAD/metering work in `artifacts/mo-app/hooks/use-voice.ts`
should keep using `recorderStateRef.current.metering` rather than reintroducing manual
`recorder.getStatus()` calls in `setInterval` callbacks.
