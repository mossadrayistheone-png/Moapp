/**
 * Direct unit tests for hooks/use-reply-masking-guard.ts — the exact wiring
 * app/(tabs)/index.tsx uses for handleToggle and each mode's submit handler.
 * These are pure functions, so we can assert ordering/conditions with plain
 * spies instead of going through a full voice/text pipeline.
 */
import { guardTextSubmit, guardVoiceToggle } from "@/hooks/use-reply-masking-guard";

describe("guardVoiceToggle", () => {
  it.each(["idle", "error"] as const)(
    "clears the stale text reply before toggling when voice is %s",
    (voiceState) => {
      const resetChat = jest.fn();
      const toggle = jest.fn();
      const calls: string[] = [];
      resetChat.mockImplementation(() => calls.push("resetChat"));
      toggle.mockImplementation(() => calls.push("toggle"));

      guardVoiceToggle({ voiceState, resetChat, toggle });

      expect(resetChat).toHaveBeenCalledTimes(1);
      expect(toggle).toHaveBeenCalledTimes(1);
      expect(calls).toEqual(["resetChat", "toggle"]); // reset MUST happen first
    }
  );

  it.each(["listening", "thinking", "speaking"] as const)(
    "does not clear the text reply mid-turn (voice state %s) — only toggles",
    (voiceState) => {
      const resetChat = jest.fn();
      const toggle = jest.fn();

      guardVoiceToggle({ voiceState, resetChat, toggle });

      expect(resetChat).not.toHaveBeenCalled();
      expect(toggle).toHaveBeenCalledTimes(1);
    }
  );
});

describe("guardTextSubmit", () => {
  it("cancels any in-flight voice turn and clears the stale voice reply before submitting the new text turn", () => {
    const cancelVoice = jest.fn();
    const resetReply = jest.fn();
    const submitText = jest.fn();
    const calls: string[] = [];
    cancelVoice.mockImplementation(() => calls.push("cancelVoice"));
    resetReply.mockImplementation(() => calls.push("resetReply"));
    submitText.mockImplementation(() => calls.push("submitText"));

    guardTextSubmit({ cancelVoice, resetReply, submitText });

    expect(cancelVoice).toHaveBeenCalledTimes(1);
    expect(resetReply).toHaveBeenCalledTimes(1);
    expect(submitText).toHaveBeenCalledTimes(1);
    // cancelVoice MUST happen first (aborts any in-flight voice API request
    // before it can later resolve and overwrite the fresh text reply), then
    // resetReply, then the new text turn is submitted.
    expect(calls).toEqual(["cancelVoice", "resetReply", "submitText"]);
  });
});
