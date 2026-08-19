---
name: Voice pipeline silent failure modes on Android
description: Confirmed break points that produce "no visible or audible output" on Android without a visible error.
---

## Break point 1 — recorder.stop() on auto-stop

When `recorder.record({ forDuration: N })` expires naturally, the native recorder stops itself. The `statusListener` (`isFinished=true`) then calls `stopAndProcess`, which calls `await recorder.stop()` on an already-stopped recorder. This throws, hits the outer catch, sets error state for 8 s, then resets to idle.

**Fix (applied):** Wrap the inner `await recorder.stop()` in its own try-catch that logs a warning and continues. The URI is still valid after natural auto-stop.

## Break point 2 — AppState "active" cleanup killing recordings (ROOT CAUSE of Daily/Luxury failure)

The `AppState` listener was calling `cleanupRef(true)` on EVERY state change, including `"active"` (returning to foreground) and `"inactive"` (notification shade, screen dim, permission dialog). On the first-ever mic tap:
1. `requestRecordingPermissionsAsync()` causes the Android permission dialog
2. AppState fires `inactive` → `active` as the dialog appears/dismisses
3. `cleanupRef(true)` fires on these transitions — stopping any recording immediately after it starts
4. `startRecording()` continues past the permission await, sets up recording, but cleanup stops it
5. User sees no output, no error (recording was stopped before any data was captured)

Executive appeared to work because the user always tested it AFTER the first Daily tap had already granted permission — no permission dialog, no AppState changes.

**Fix (applied):** Only call `cleanupRef(true)` on `"background"` (app truly switched away or screen locked). Do NOT clean up on `"inactive"` or `"active"`. The `forDuration` hard cap (5 s) ensures recordings always self-terminate even without AppState cleanup.

```ts
const handleAppStateChange = (next: AppStateStatus) => {
  if (next === "background") {
    cleanupRef.current?.(true).catch(() => {});
  }
  // "inactive" and "active" intentionally not handled — see comment in code
};
```

## Break point 3 — error messages too brief

All error states previously auto-reset to idle after 3–4 s. Extended to 8 s so users see what went wrong.

## Diagnosis approach

When user reports "no visible or audible output":
1. Test `/api/mo/voice` via curl with WAV audio — confirms backend health
2. Check API server workflow is RUNNING (not FINISHED/crashed)
3. Confirm `recorder.stop()` inner try-catch is present at the `stopAndProcess` call site
4. Check AppState handler — it must only fire cleanup on `"background"`, not `"inactive"` or `"active"`
5. Check `EXPO_PUBLIC_DOMAIN` in `eas.json` matches the live dev domain
