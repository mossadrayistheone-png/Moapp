/**
 * Direct unit tests for hooks/use-reply-masking-guard.ts — the exact wiring
 * app/(tabs)/index.tsx uses for handleToggle and each mode's submit handler.
 * These are pure functions, so we can assert ordering/conditions with plain
 * spies instead of going through a full voice/text pipeline.
 */
import { guardModeSwitch, guardTextSubmit, guardVoiceToggle } from "@/hooks/use-reply-masking-guard";

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

describe("guardModeSwitch", () => {
  function makeMocks() {
    const calls: string[] = [];
    const cancelVoice = jest.fn(() => calls.push("cancelVoice"));
    const resetReply = jest.fn(() => calls.push("resetReply"));
    const setMode = jest.fn(() => calls.push("setMode"));
    const resetChat = jest.fn(() => calls.push("resetChat"));
    return { calls, cancelVoice, resetReply, setMode, resetChat };
  }

  it.each(["listening", "thinking", "speaking", "error"] as const)(
    "cancels the in-flight voice turn, clears both sides' reply state, and commits the new mode (voice state %s)",
    (voiceState) => {
      const { calls, cancelVoice, resetReply, setMode, resetChat } = makeMocks();

      guardModeSwitch({
        currentMode: "daily",
        targetMode: "luxury",
        voiceState,
        cancelVoice,
        resetReply,
        setMode,
        resetChat,
      });

      expect(cancelVoice).toHaveBeenCalledTimes(1);
      expect(resetReply).toHaveBeenCalledTimes(1);
      expect(setMode).toHaveBeenCalledWith("luxury");
      expect(resetChat).toHaveBeenCalledTimes(1);
      // cancelVoice MUST happen before resetReply/setMode (aborts the
      // in-flight fetch before its late success handler could otherwise
      // repopulate reply), and resetChat runs last.
      expect(calls).toEqual(["cancelVoice", "resetReply", "setMode", "resetChat"]);
    }
  );

  it("does not cancel (nothing to cancel, already idle) but still clears stale reply/transcript from a turn that already completed under the old persona", () => {
    const { calls, cancelVoice, resetReply, setMode, resetChat } = makeMocks();

    guardModeSwitch({
      currentMode: "executive",
      targetMode: "daily",
      voiceState: "idle",
      cancelVoice,
      resetReply,
      setMode,
      resetChat,
    });

    expect(cancelVoice).not.toHaveBeenCalled();
    // resetReply MUST still run — a completed voice reply from the OLD
    // persona would otherwise bleed into the NEW persona's screen via the
    // shared `reply || chatReply` fallback, even though no turn is
    // in-flight and there is nothing to cancel.
    expect(resetReply).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledWith("daily");
    expect(resetChat).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["resetReply", "setMode", "resetChat"]);
  });

  it("does not touch voice state (no cancel/reset/setMode) when the mode hasn't actually changed, but still resets stale text chat", () => {
    const { calls, cancelVoice, resetReply, setMode, resetChat } = makeMocks();

    guardModeSwitch({
      currentMode: "daily",
      targetMode: "daily",
      voiceState: "idle",
      cancelVoice,
      resetReply,
      setMode,
      resetChat,
    });

    expect(cancelVoice).not.toHaveBeenCalled();
    expect(resetReply).not.toHaveBeenCalled();
    expect(setMode).not.toHaveBeenCalled();
    expect(resetChat).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["resetChat"]);
  });
});
