---
name: Jest testing for Mo's voice/text hooks
description: How to unit-test useVoice/useTextChat (native audio deps, real timers) without full RN component rendering.
---

`artifacts/mo-app` had no test framework before this; `jest-expo` + `@testing-library/react-native` were added as devDependencies scoped to that package (`jest.config.js`, `pnpm --filter @workspace/mo-app run test`). Registered as validation command `mo-app-test`.

## Testing `useVoice` without a real microphone
- Pass `autoplay: false` in the hook options. This makes a completed turn take the "text-only fallback" branch (`!autoplay || !audiobase64` in `stopAndProcess`), which sets `transcript`/`reply` and returns to idle WITHOUT ever touching `useAudioPlayer` playback state machine (no need to simulate `isLoaded`/`playing` transitions).
- Mock `expo-av`'s `Audio.Sound.createAsync` to reject immediately — `playFillerAsync`'s catch branch resolves right away, skipping the need to simulate `didJustFinish` playback status callbacks for the filler clip.
- Mock `expo-audio`'s `useAudioRecorder`/`useAudioRecorderState`/`useAudioPlayer`/`useAudioPlayerStatus` as **stable module-scope objects** (not `jest.fn(() => ({...}))` returning a fresh object every call) — mirrors the real native module's stable-handle behavior and avoids stale-closure surprises in the hook's callbacks.
- Use **real timers**, not fake ones — the hook's VAD ambient-noise calibration runs a real `setInterval` loop (~300ms wall clock) before it's safe to trigger `stopAndProcess`. Drive the turn by calling `toggle()` twice (start, then stop) via the test's `handleToggle`, waiting for `state === "listening"` first, and adding a short real delay (~400ms) before the second toggle so the calibration interval clears itself — otherwise it leaks into the next test and logs "Cannot log after tests are done".

## Testability requires extracting orchestration logic
`app/(tabs)/index.tsx`'s `handleToggle` (clears text reply before a fresh voice turn) and `makeSubmitHandler` (clears voice reply before a fresh text turn) were inline closures — untestable without rendering the full screen tree (RevenueCat, AsyncStorage, Haptics, etc.). Extracted the guard conditions into `hooks/use-reply-masking-guard.ts` (pure functions `guardVoiceToggle`/`guardTextSubmit`) so both index.tsx and tests import the same real code. **Why:** a test that reimplements the wiring instead of importing it will not catch a regression in the actual production wiring.
