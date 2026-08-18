---
name: Voice pipeline silent failure modes on Android
description: Two confirmed break points that produce "no visible or audible output" on Android without a visible error.
---

## Break point 1 — recorder.stop() on auto-stop

When `recorder.record({ forDuration: N })` expires naturally, the native recorder stops itself. The `statusListener` (`isFinished=true`) then calls `stopAndProcess`, which calls `await recorder.stop()` on an already-stopped recorder. This throws, hits the outer catch, sets error state for 3–4 s, then resets to idle. User sees nothing.

**Fix (applied):** Wrap the inner `await recorder.stop()` in its own try-catch that logs a warning and continues. The URI is still valid after natural auto-stop.

```ts
try {
  await recorder.stop();
} catch (stopErr) {
  console.warn("[Mo] recorder.stop() threw (likely already stopped by forDuration):", stopErr);
}
recordingActive.current = false;
const uri = recorder.uri;
```

## Break point 2 — error messages too brief

All error states previously auto-reset to idle after 3–4 s. Users miss the message and the "Try Again" button. Extended to 8 s.

**Why:** On a real device the error card appears and disappears within 3–4 s. If the user's gaze is elsewhere (common on a phone) they see nothing.

## Diagnosis approach

When user reports "no visible or audible output":
1. Test `/api/mo/voice` via curl with WAV audio — confirms backend health
2. Check API server workflow is RUNNING (not FINISHED/crashed)
3. Confirm `recorder.stop()` inner try-catch is present at the `stopAndProcess` call site
4. Check `EXPO_PUBLIC_DOMAIN` in `eas.json` matches the live dev domain
