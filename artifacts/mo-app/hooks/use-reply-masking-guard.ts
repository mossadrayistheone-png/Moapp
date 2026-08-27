/**
 * Guards against the "stale answer" bug: every mode screen renders
 * `reply || chatReply` and `transcript || liveTranscript`, so whichever
 * side (voice or text) still holds content from a PREVIOUS turn keeps
 * winning the `||` and masks a brand-new answer on the other side.
 *
 * These two guards are the fix, factored out of app/(tabs)/index.tsx so they
 * can be unit-tested directly (see __tests__/use-reply-masking-guard.test.ts)
 * instead of only being exercised indirectly through the screen components.
 */
import type { AssistantState } from "@/hooks/use-voice";

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
 * Wraps a text submission: clears stale VOICE reply/transcript state before
 * the new text turn is sent, so it can never mask the new text answer.
 */
export function guardTextSubmit(params: {
  resetReply: () => void;
  submitText: () => void;
}): void {
  params.resetReply();
  params.submitText();
}
