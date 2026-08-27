/**
 * Guards against the "stale answer" bug: every mode screen renders
 * `reply || chatReply` and `transcript || liveTranscript`, so whichever
 * side (voice or text) still holds content from a PREVIOUS turn keeps
 * winning the `||` and masks a brand-new answer on the other side.
 *
 * These guards are the fix, factored out of app/(tabs)/index.tsx so they
 * can be unit-tested directly (see __tests__/use-reply-masking-guard.test.ts)
 * instead of only being exercised indirectly through the screen components.
 */
import type { AssistantMode, AssistantState } from "@/hooks/use-voice";

/**
 * Wraps the mic toggle: clears a stale TEXT reply before a fresh voice turn
 * can start, so it can never mask the new voice answer once it lands.
 * No-ops the clear while a voice turn is already in flight (listening /
 * thinking / speaking) — only a turn starting from idle/error is "fresh".
 */
export function guardVoiceToggle(params: {
  voiceState: AssistantState;
  resetChat: () => void;
  toggle: () => void;
}): void {
  const { voiceState, resetChat, toggle } = params;
  if (voiceState === "idle" || voiceState === "error") resetChat();
  toggle();
}

/**
 * Wraps a text submission: cancels any in-flight VOICE turn and clears stale
 * voice reply/transcript state before the new text turn is sent.
 *
 * The cancel is required, not just the reset: resetReply() only clears the
 * *displayed* strings. If a voice turn is still in flight (its API request
 * hasn't resolved yet — real network latency, not the instant-resolving
 * mocks), that request keeps running after resetReply() fires. When it
 * later resolves, useVoice's success handler calls setReply()/setTranscript()
 * unconditionally, silently reintroducing the stale voice answer and masking
 * the text answer that just arrived. cancelVoice() aborts that in-flight
 * fetch (via fetchAbortRef) so its success handler never runs — mirroring
 * how starting a fresh voice turn already aborts an in-flight text request
 * via resetChat()'s abortRef. cancelVoice() is a no-op when no voice turn is
 * active (the common case: waiting for a voice answer to finish before
 * typing), so this never affects the already-covered sequential-turn tests.
 */
export function guardTextSubmit(params: {
  cancelVoice: () => void;
  resetReply: () => void;
  submitText: () => void;
}): void {
  params.cancelVoice();
  params.resetReply();
  params.submitText();
}

/**
 * Wraps a carousel mode switch (Daily/Executive/Luxury): cancels any
 * in-flight voice turn, clears BOTH sides' displayed reply/transcript state,
 * then commits the new mode.
 *
 * Cancelling alone is not enough. cancelVoice() aborts the in-flight fetch
 * (via fetchAbortRef) so its success handler can never fire late and repopulate
 * `reply`, but it does NOT clear an already-populated `reply`/`transcript` from
 * a turn that already completed under the OLD persona before the swipe. Since
 * useVoice/useTextChat are single instances shared across all three mode
 * screens, that leftover state is exactly what each screen's `reply ||
 * chatReply` fallback would render — silently attributing the previous
 * persona's answer to the new one. resetReply() (voice) and resetChat()
 * (text) must run on every mode change, not just while a turn is in flight,
 * to guarantee a fresh persona always starts from a blank slate.
 */
export function guardModeSwitch(params: {
  currentMode: AssistantMode;
  targetMode: AssistantMode;
  voiceState: AssistantState;
  cancelVoice: () => void;
  resetReply: () => void;
  setMode: (mode: AssistantMode) => void;
  resetChat: () => void;
}): void {
  const { currentMode, targetMode, voiceState, cancelVoice, resetReply, setMode, resetChat } = params;
  if (currentMode !== targetMode) {
    // A voice turn started under the OLD persona (mid-recording, thinking, or
    // speaking) must never be allowed to land and answer as the NEW persona
    // once the user has swiped away.
    if (voiceState !== "idle") cancelVoice();
    resetReply();
    setMode(targetMode);
  }
  // Reset text chat on every mode change (even if a text turn already
  // completed) so a finished-but-stale reply can't bleed into the new mode.
  resetChat();
}
