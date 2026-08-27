/**
 * Regression coverage for hooks/use-text-chat.ts.
 *
 * `resetChat()` is the half of the voice<->text masking fix that lives in
 * this hook: `index.tsx`'s `handleToggle` calls it before starting a fresh
 * voice turn so a stale text reply can never mask the new voice answer.
 * If `resetChat` stops clearing `chatReply`/`chatError`/`chatState`, that
 * masking bug comes back silently.
 */
import { act, renderHook } from "@testing-library/react-native";
import { useTextChat } from "@/hooks/use-text-chat";

const baseContext = {
  mode: "daily" as const,
  messages: [],
  memories: [],
  tasks: [],
  reminders: [],
  notes: [],
};

function mockFetchOnce(reply: string) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ reply }),
  });
}

describe("useTextChat", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("populates chatReply after a successful submission", async () => {
    mockFetchOnce("Hello from text mode");
    const onComplete = jest.fn();
    const { result } = renderHook(() => useTextChat({ onComplete }));

    await act(async () => {
      await result.current.submitText("hi", baseContext);
    });

    expect(result.current.chatReply).toBe("Hello from text mode");
    expect(result.current.chatState).toBe("done");
    expect(onComplete).toHaveBeenCalledWith("hi", "Hello from text mode", expect.any(Object));
  });

  it("resetChat clears a stale reply, error, and state back to idle", async () => {
    mockFetchOnce("Some earlier answer");
    const { result } = renderHook(() => useTextChat({ onComplete: jest.fn() }));

    await act(async () => {
      await result.current.submitText("hi", baseContext);
    });
    expect(result.current.chatReply).toBe("Some earlier answer");

    act(() => {
      result.current.resetChat();
    });

    expect(result.current.chatReply).toBe("");
    expect(result.current.chatError).toBe("");
    expect(result.current.chatState).toBe("idle");
  });

  it("a fresh submission after resetChat never resurrects the old reply, even on failure", async () => {
    mockFetchOnce("Old reply that must not resurface");
    const { result } = renderHook(() => useTextChat({ onComplete: jest.fn() }));

    await act(async () => {
      await result.current.submitText("first message", baseContext);
    });
    expect(result.current.chatReply).toBe("Old reply that must not resurface");

    act(() => {
      result.current.resetChat();
    });

    // Next request fails outright — chatReply must stay cleared, not fall
    // back to whatever the previous turn last set.
    (global as any).fetch = jest.fn().mockRejectedValue(new Error("network down"));
    await act(async () => {
      await result.current.submitText("second message", baseContext);
    });

    expect(result.current.chatReply).toBe("");
    expect(result.current.chatState).toBe("error");
  });
});
