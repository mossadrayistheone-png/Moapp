/**
 * Regression coverage for Task 55: switching modes (Daily/Executive/Luxury)
 * mid-conversation must never let an answer land attributed to the WRONG
 * persona.
 *
 * This is a sibling bug to the voice<->text masking regression covered by
 * __tests__/voice-text-reply-masking.test.tsx (Task 53), and shares its root
 * cause: useVoice + useTextChat are single instances shared across all three
 * mode screens (see app/(tabs)/index.tsx), and every screen renders
 * `reply || chatReply` / `transcript || liveTranscript`. Two different ways
 * stale content can bleed across a mode switch:
 *
 *  1. A turn is still IN FLIGHT (API request pending) when the user swipes to
 *     a different mode. Without cancelling it, its success handler can fire
 *     late and populate `reply`/`chatReply` under the NEW mode.
 *  2. A turn already COMPLETED under the OLD persona (state back to idle,
 *     reply populated) before the swipe. Without clearing displayed state on
 *     every mode change — not just while something is in flight — that
 *     finished answer keeps showing on the NEW mode's screen, silently
 *     misattributed to the new persona.
 *
 * guardModeSwitch (hooks/use-reply-masking-guard.ts) is the fix for both:
 * cancel any in-flight voice turn, THEN unconditionally clear both sides'
 * displayed reply/transcript state, THEN commit the new mode.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  guardModeSwitch,
  guardTextSubmit,
  guardVoiceToggle,
} from "@/hooks/use-reply-masking-guard";
import { useTextChat } from "@/hooks/use-text-chat";
import { useVoice, type AssistantMode } from "@/hooks/use-voice";
import * as FileSystemLegacy from "expo-file-system/legacy";

// ── expo-av: only used for the filler clip played while "thinking". Make it
// fail immediately so the pipeline falls straight through without needing to
// simulate real playback status callbacks. ──────────────────────────────────
jest.mock("expo-av", () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockRejectedValue(new Error("no filler audio in tests")),
    },
  },
}));

// ── expo-file-system/legacy: reading the recorded audio file for upload ────
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn().mockResolvedValue("ZmFrZS1hdWRpby1kYXRh"),
  EncodingType: { Base64: "base64" },
}));

// ── expo-audio: recorder/player hooks. Kept as stable module-scope objects
// so every render of the hook sees the same instance (mirrors the real
// native module's stable-handle behaviour). ────────────────────────────────
const mockRecorder = {
  uri: "file:///fake-recording.aac",
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  record: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
};
const mockPlayer = {
  playing: false,
  play: jest.fn(),
  pause: jest.fn(),
};

jest.mock("expo-audio", () => ({
  useAudioRecorder: jest.fn(() => mockRecorder),
  useAudioRecorderState: jest.fn(() => ({ metering: -10 })),
  useAudioPlayer: jest.fn(() => mockPlayer),
  useAudioPlayerStatus: jest.fn(() => ({ isLoaded: false, playing: false })),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  IOSOutputFormat: { MPEG4AAC: "mpeg4aac" },
  AudioQuality: { MEDIUM: "medium" },
}));

function mockChatApiOnce(reply: string) {
  (global as any).fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes("/api/mo/chat")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ reply }),
      });
    }
    throw new Error(`Unexpected fetch in chat test: ${url}`);
  });
}

/**
 * Mocks the voice endpoint so `fetch()` itself resolves IMMEDIATELY (as if
 * the response headers had already fully arrived), but `response.json()`
 * — reading the body — stays pending until `resolveJson()` is called. This
 * is NOT wired to the AbortSignal at all, deliberately: it reproduces the
 * race an abort-signal check on the outer fetch promise cannot catch, where
 * the network response had already arrived before cancelVoice() ran and only
 * the body-parsing continuation is still outstanding when the mode switch
 * happens. The pipeline's own `fetchController.signal.aborted` check (added
 * inside the `.then()` callback in use-voice.ts) is what has to catch this.
 */
function mockVoiceApiWithDelayedJsonAfterResolve(reply: string) {
  let resolveJson: () => void = () => {};
  const jsonPending = new Promise<void>((resolve) => {
    resolveJson = resolve;
  });
  (global as any).fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes("/api/mo/voice")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          jsonPending.then(() => ({
            transcript: "a spoken message",
            reply,
            audioBase64: undefined,
          })),
      });
    }
    throw new Error(`Unexpected fetch in voice test: ${url}`);
  });
  return { resolveJson: () => resolveJson() };
}

/** Same race, for the text-chat endpoint. See mockVoiceApiWithDelayedJsonAfterResolve. */
function mockChatApiWithDelayedJsonAfterResolve(reply: string) {
  let resolveJson: () => void = () => {};
  const jsonPending = new Promise<void>((resolve) => {
    resolveJson = resolve;
  });
  (global as any).fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes("/api/mo/chat")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => jsonPending.then(() => ({ reply })),
      });
    }
    throw new Error(`Unexpected fetch in chat test: ${url}`);
  });
  return { resolveJson: () => resolveJson() };
}

/**
 * Mocks BOTH endpoints at once, with one endpoint held pending until its
 * resolver is called and wired to reject with AbortError the moment its
 * request's AbortSignal fires — simulating real network latency so a mode
 * switch can happen while the request is still in flight.
 */
function mockCombinedApisWithDelay(params: {
  delayed: "voice" | "chat";
  voiceReply: string;
  chatReply: string;
}) {
  let resolveDelayed: () => void = () => {};
  const delayedPending = new Promise<void>((resolve) => {
    resolveDelayed = resolve;
  });

  const makeAbortable = (settle: () => any) =>
    new Promise((resolve) => {
      delayedPending.then(() => resolve(settle()));
    });

  const withAbort = (init: any, promise: Promise<any>) =>
    new Promise((resolve, reject) => {
      const signal: AbortSignal | undefined = init?.signal;
      const onAbort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort);
      }
      promise.then(resolve, reject);
    });

  (global as any).fetch = jest.fn().mockImplementation((url: string, init?: any) => {
    if (String(url).includes("/api/mo/voice")) {
      const settle = () => ({
        ok: true,
        status: 200,
        json: async () => ({
          transcript: "a spoken message",
          reply: params.voiceReply,
          audioBase64: undefined,
        }),
      });
      return params.delayed === "voice"
        ? withAbort(init, makeAbortable(settle))
        : Promise.resolve(settle());
    }
    if (String(url).includes("/api/mo/chat")) {
      const settle = () => ({
        ok: true,
        status: 200,
        json: async () => ({ reply: params.chatReply }),
      });
      return params.delayed === "chat"
        ? withAbort(init, makeAbortable(settle))
        : Promise.resolve(settle());
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  return { resolveDelayed: () => resolveDelayed() };
}

/**
 * Renders useVoice + useTextChat together with the exact mode-switch,
 * voice-toggle, and text-submit wiring app/(tabs)/index.tsx uses (via the
 * real, exported guard functions — not a reimplementation) so a regression
 * in index.tsx's actual wiring fails this test too.
 */
function renderModeSwitchHarness(spies: { onTurnComplete?: (...args: any[]) => void; onChatComplete?: (...args: any[]) => void } = {}) {
  return renderHook(() => {
    const voice = useVoice({ autoplay: false, callbacks: { onTurnComplete: spies.onTurnComplete } });
    const chat = useTextChat({ onComplete: spies.onChatComplete ?? (() => {}) });

    const switchMode = (targetMode: AssistantMode) => {
      guardModeSwitch({
        currentMode: voice.mode,
        targetMode,
        voiceState: voice.state,
        cancelVoice: voice.cancelVoice,
        resetReply: voice.resetReply,
        setMode: voice.setMode,
        resetChat: chat.resetChat,
      });
    };

    const handleToggle = () => {
      guardVoiceToggle({ voiceState: voice.state, resetChat: chat.resetChat, toggle: voice.toggle });
    };

    const submitTextForMode = (text: string, mode: AssistantMode) => {
      guardTextSubmit({
        cancelVoice: voice.cancelVoice,
        resetReply: voice.resetReply,
        submitText: () =>
          chat.submitText(text, {
            mode,
            messages: [],
            memories: [],
            tasks: [],
            reminders: [],
            notes: [],
          }),
      });
    };

    // Exactly what every mode screen renders.
    const displayedReply = voice.reply || chat.chatReply;
    const displayedTranscript = voice.transcript || voice.liveTranscript;

    return { voice, chat, switchMode, handleToggle, submitTextForMode, displayedReply, displayedTranscript };
  });
}

describe("mode-switch reply masking regression (Task 55)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("a voice turn interrupted by a mode switch never lands attributed to the new mode", async () => {
    const { result } = renderModeSwitchHarness();
    expect(result.current.voice.mode).toBe("daily"); // default

    const { resolveDelayed: resolveVoice } = mockCombinedApisWithDelay({
      delayed: "voice",
      voiceReply: "STALE_DAILY_ANSWER",
      chatReply: "unused",
    });

    // Start a voice turn under "daily".
    act(() => {
      result.current.handleToggle(); // idle -> listening
    });
    await waitFor(() => expect(result.current.voice.state).toBe("listening"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400)); // ambient calibration
    });
    act(() => {
      result.current.handleToggle(); // listening -> stopAndProcess; voice fetch now pending
    });
    await waitFor(() => expect(result.current.voice.state).toBe("thinking"));

    // User swipes to Luxury before the "daily" voice turn's API call resolves.
    act(() => {
      result.current.switchMode("luxury");
    });

    expect(result.current.voice.mode).toBe("luxury");
    // The in-flight turn was cancelled immediately — pipeline back to idle,
    // no leftover transcript from the OLD persona's recording.
    expect(result.current.voice.state).toBe("idle");
    expect(result.current.displayedTranscript).toBe("");
    expect(result.current.displayedReply).toBe("");

    // Now let the stale "daily" voice request settle (aborted, so this is a
    // no-op — proving the abort actually took effect, not that the response
    // simply hadn't arrived yet).
    await act(async () => {
      resolveVoice();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.voice.reply).toBe("");
    expect(result.current.displayedReply).toBe("");
    expect(result.current.voice.mode).toBe("luxury");
  });

  it("a voice API response whose body finishes parsing only AFTER the mode switch cancelled it mutates no state and fires no callback", async () => {
    // The abort-signal check on the outer fetch() promise cannot catch this:
    // the response had already arrived (fetch() resolved) before the mode
    // switch/cancel happened, and only the body-read (response.json()) is
    // still pending. Without a stale-turn check made INSIDE the `.then()`
    // that receives the parsed data, setTranscript/setReply/onTurnComplete
    // would still fire once json() finally resolves, misattributing the
    // reply to whatever mode/persona is active by then.
    const onTurnComplete = jest.fn();
    const { result } = renderModeSwitchHarness({ onTurnComplete });
    const { resolveJson } = mockVoiceApiWithDelayedJsonAfterResolve("STALE_DAILY_ANSWER");

    act(() => {
      result.current.handleToggle(); // idle -> listening
    });
    await waitFor(() => expect(result.current.voice.state).toBe("listening"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    act(() => {
      result.current.handleToggle(); // listening -> stopAndProcess; fetch() resolves immediately, json() still pending
    });
    await waitFor(() => expect(result.current.voice.state).toBe("thinking"));

    // Mode switch cancels the turn WHILE the response body is still being read.
    act(() => {
      result.current.switchMode("luxury");
    });
    expect(result.current.voice.state).toBe("idle");
    expect(result.current.voice.mode).toBe("luxury");

    // Now the body finally finishes parsing, well after cancellation.
    await act(async () => {
      resolveJson();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.voice.reply).toBe("");
    expect(result.current.voice.transcript).toBe("");
    expect(result.current.displayedReply).toBe("");
    expect(onTurnComplete).not.toHaveBeenCalled();
    expect(result.current.voice.mode).toBe("luxury");
    expect(result.current.voice.state).toBe("idle");
  });

  it("a chat API response that finishes parsing only AFTER the mode switch cancelled it mutates no state and fires no onComplete callback", async () => {
    const onChatComplete = jest.fn();
    const { result } = renderModeSwitchHarness({ onChatComplete });
    const { resolveJson } = mockChatApiWithDelayedJsonAfterResolve("STALE_EXECUTIVE_ANSWER");

    act(() => {
      result.current.switchMode("executive");
    });
    act(() => {
      result.current.submitTextForMode("what's my agenda?", "executive"); // fetch() resolves immediately, json() still pending
    });
    await waitFor(() => expect(result.current.chat.chatState).toBe("loading"));

    // Mode switch cancels the turn WHILE the response body is still being read.
    act(() => {
      result.current.switchMode("daily");
    });
    expect(result.current.chat.chatState).toBe("idle");
    expect(result.current.voice.mode).toBe("daily");

    // Now the body finally finishes parsing, well after cancellation.
    await act(async () => {
      resolveJson();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.chat.chatReply).toBe("");
    expect(result.current.displayedReply).toBe("");
    expect(onChatComplete).not.toHaveBeenCalled();
    expect(result.current.voice.mode).toBe("daily");
    expect(result.current.chat.chatState).toBe("idle");
  });

  it("a mode switch during recorder.stop() (BEFORE any fetch/AbortController exists) prevents the turn from ever sending a request or landing a reply", async () => {
    // The two prior in-flight tests both switch mode only once the voice
    // fetch is already pending — the AbortController exists by then and
    // cancelVoice() can abort it. This test targets the earlier window,
    // between the mic being released and the fetch being created, where
    // there is nothing yet to abort. Only the per-turn ownership token
    // (activeTurnRef in use-voice.ts) can stop the turn here.
    let resolveStop: () => void = () => {};
    const stopPending = new Promise<void>((resolve) => { resolveStop = resolve; });
    mockRecorder.stop.mockImplementationOnce(() => stopPending);

    const fetchSpy = jest.fn().mockImplementation((url: string) => {
      throw new Error(`No request should ever be sent for a cancelled turn: ${url}`);
    });
    (global as any).fetch = fetchSpy;

    const { result } = renderModeSwitchHarness();

    act(() => {
      result.current.handleToggle(); // idle -> listening
    });
    await waitFor(() => expect(result.current.voice.state).toBe("listening"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400)); // ambient calibration
    });
    act(() => {
      result.current.handleToggle(); // listening -> stopAndProcess; recorder.stop() now pending
    });
    // Still "listening" — stopAndProcess hasn't advanced past recorder.stop() yet.
    expect(result.current.voice.state).toBe("listening");

    // Mode switch while recorder.stop() is still pending — cancelVoice() has
    // no fetchController to abort yet.
    act(() => {
      result.current.switchMode("luxury");
    });
    expect(result.current.voice.mode).toBe("luxury");
    expect(result.current.voice.state).toBe("idle");

    // Now let recorder.stop() finally resolve — stopAndProcess resumes and
    // must discard itself instead of continuing to "thinking"/sending a request.
    await act(async () => {
      resolveStop();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.voice.state).toBe("idle");
    expect(result.current.voice.reply).toBe("");
    expect(result.current.voice.transcript).toBe("");
    expect(result.current.displayedReply).toBe("");
    expect(result.current.voice.mode).toBe("luxury");
  });

  it("a mode switch during the post-stop audio file read (BEFORE any fetch/AbortController exists) prevents the turn from ever sending a request or landing a reply", async () => {
    let resolveRead: (value: string) => void = () => {};
    const readPending = new Promise<string>((resolve) => { resolveRead = resolve; });
    (FileSystemLegacy.readAsStringAsync as jest.Mock).mockImplementationOnce(() => readPending);

    const fetchSpy = jest.fn().mockImplementation((url: string) => {
      throw new Error(`No request should ever be sent for a cancelled turn: ${url}`);
    });
    (global as any).fetch = fetchSpy;

    const { result } = renderModeSwitchHarness();

    act(() => {
      result.current.handleToggle(); // idle -> listening
    });
    await waitFor(() => expect(result.current.voice.state).toBe("listening"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    act(() => {
      result.current.handleToggle(); // listening -> stopAndProcess; recorder.stop() resolves immediately, file read now pending
    });
    // recorder.stop() already resolved (default immediate mock) — state has
    // advanced to "thinking", but the file read (and therefore any fetch)
    // hasn't happened yet.
    await waitFor(() => expect(result.current.voice.state).toBe("thinking"));

    // Mode switch while the file read is still pending — still nothing to abort.
    act(() => {
      result.current.switchMode("luxury");
    });
    expect(result.current.voice.mode).toBe("luxury");
    expect(result.current.voice.state).toBe("idle");

    // Now let the file read finally resolve — stopAndProcess resumes and
    // must discard itself instead of building/sending a request.
    await act(async () => {
      resolveRead("ZmFrZS1hdWRpby1kYXRh");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.voice.state).toBe("idle");
    expect(result.current.voice.reply).toBe("");
    expect(result.current.voice.transcript).toBe("");
    expect(result.current.displayedReply).toBe("");
    expect(result.current.voice.mode).toBe("luxury");
  });

  it("a voice reply that already completed under the OLD persona does not bleed into the NEW persona's screen after switching", async () => {
    // Distinct from the in-flight race above: here the turn finishes (state
    // returns to idle, reply populated) BEFORE the user swipes. Without
    // resetReply() running on every mode change (not just while something is
    // in flight), the finished "daily" answer would still be showing once
    // the screen switches to "luxury" — misattributed to the new persona.
    const { result } = renderModeSwitchHarness();
    (global as any).fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes("/api/mo/voice")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            transcript: "what's on my calendar",
            reply: "DAILY_ANSWER_ALREADY_DONE",
            audioBase64: undefined,
          }),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    act(() => {
      result.current.handleToggle(); // idle -> listening
    });
    await waitFor(() => expect(result.current.voice.state).toBe("listening"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    act(() => {
      result.current.handleToggle(); // listening -> stopAndProcess
    });
    await waitFor(() => expect(result.current.voice.reply).toBe("DAILY_ANSWER_ALREADY_DONE"));
    expect(result.current.voice.state).toBe("idle");

    // Now, well after the turn completed, the user swipes to Luxury.
    act(() => {
      result.current.switchMode("luxury");
    });

    expect(result.current.voice.mode).toBe("luxury");
    expect(result.current.voice.reply).toBe("");
    expect(result.current.displayedReply).toBe("");
    expect(result.current.voice.transcript).toBe("");
  });

  it("a text turn interrupted by a mode switch never lands attributed to the new mode", async () => {
    const { result } = renderModeSwitchHarness();

    const { resolveDelayed: resolveChat } = mockCombinedApisWithDelay({
      delayed: "chat",
      voiceReply: "unused",
      chatReply: "STALE_EXECUTIVE_ANSWER",
    });

    act(() => {
      result.current.switchMode("executive");
    });
    expect(result.current.voice.mode).toBe("executive");

    // Submit a text turn under "executive"; the chat request is now pending.
    act(() => {
      result.current.submitTextForMode("what's my agenda?", "executive");
    });
    await waitFor(() => expect(result.current.chat.chatState).toBe("loading"));

    // User swipes to Daily before the "executive" chat turn's API call resolves.
    act(() => {
      result.current.switchMode("daily");
    });

    expect(result.current.voice.mode).toBe("daily");
    // resetChat() aborted the in-flight request and cleared the displayed
    // state immediately.
    expect(result.current.chat.chatState).toBe("idle");
    expect(result.current.displayedReply).toBe("");

    // Let the stale "executive" chat request settle (aborted, so a no-op —
    // proving the abort actually took effect).
    await act(async () => {
      resolveChat();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.chat.chatReply).toBe("");
    expect(result.current.displayedReply).toBe("");
    expect(result.current.voice.mode).toBe("daily");
  });

  it("a text reply that already completed under the OLD persona does not bleed into the NEW persona's screen after switching", async () => {
    const { result } = renderModeSwitchHarness();
    mockChatApiOnce("EXECUTIVE_ANSWER_ALREADY_DONE");

    act(() => {
      result.current.switchMode("executive");
    });
    await act(async () => {
      await result.current.submitTextForMode("plan my day", "executive");
    });
    await waitFor(() => expect(result.current.chat.chatReply).toBe("EXECUTIVE_ANSWER_ALREADY_DONE"));

    // User swipes to Luxury well after the text turn already completed.
    act(() => {
      result.current.switchMode("luxury");
    });

    expect(result.current.voice.mode).toBe("luxury");
    expect(result.current.chat.chatReply).toBe("");
    expect(result.current.displayedReply).toBe("");
  });
});
