/**
 * Regression test for the "stale answer" bug: switching between talking and
 * typing to Mo must never leave the old mode's reply on screen.
 *
 * Root cause (already fixed in hooks/use-voice.ts + app/(tabs)/index.tsx):
 * every mode screen renders `reply || chatReply` and `transcript ||
 * liveTranscript`. Nothing cleared the voice-side state when a text turn
 * started (or vice versa), so the stale value kept winning the `||`.
 *
 * This test wires useVoice + useTextChat together exactly the way
 * app/(tabs)/index.tsx does — handleToggle calls resetChat() before a fresh
 * voice turn, and the per-mode submit handler calls resetReply() before
 * submitText() — then drives one full voice turn and one full text turn (in
 * both orders) and asserts the displayed `reply || chatReply` always
 * reflects the LATEST turn, matching the shared rendering logic used
 * identically by DailyScreen, ExecutiveScreen, and LuxuryScreen.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { guardTextSubmit, guardVoiceToggle } from "@/hooks/use-reply-masking-guard";
import { useTextChat } from "@/hooks/use-text-chat";
import { useVoice } from "@/hooks/use-voice";

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

function mockVoiceApiOnce(reply: string, transcript = "a spoken message") {
  (global as any).fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes("/api/mo/voice")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ transcript, reply, audioBase64: undefined }),
      });
    }
    throw new Error(`Unexpected fetch in voice test: ${url}`);
  });
}

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
 * Renders useVoice + useTextChat together and exposes the same wiring
 * app/(tabs)/index.tsx uses, so the test drives the app exactly the way a
 * user would: toggle the mic, or submit typed text.
 */
function renderMoHarness() {
  return renderHook(() => {
    const voice = useVoice({ autoplay: false });
    const chat = useTextChat({ onComplete: () => {} });

    // Same wiring app/(tabs)/index.tsx uses (handleToggle / makeSubmitHandler),
    // via the real, exported guard functions — not a reimplementation — so a
    // regression in index.tsx's actual wiring fails this test too.
    const handleToggle = () => {
      guardVoiceToggle({ voiceState: voice.state, resetChat: chat.resetChat, toggle: voice.toggle });
    };

    const submitTextForMode = (text: string) => {
      guardTextSubmit({
        resetReply: voice.resetReply,
        submitText: () =>
          chat.submitText(text, {
            mode: "daily",
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

    return { voice, chat, handleToggle, submitTextForMode, displayedReply, displayedTranscript };
  });
}

async function doVoiceTurn(result: ReturnType<typeof renderMoHarness>["result"], reply: string) {
  mockVoiceApiOnce(reply);
  act(() => {
    result.current.handleToggle(); // idle -> listening (starts recording)
  });
  await waitFor(() => expect(result.current.voice.state).toBe("listening"));
  // Let the (real-timer) ambient-noise calibration window finish before
  // stopping, so its setInterval clears itself instead of leaking into the
  // next test — mirrors a real user pausing briefly before releasing.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  act(() => {
    result.current.handleToggle(); // listening -> stopAndProcess
  });
  await waitFor(() => expect(result.current.voice.reply).toBe(reply));
}

async function doTextTurn(result: ReturnType<typeof renderMoHarness>["result"], text: string, reply: string) {
  mockChatApiOnce(reply);
  await act(async () => {
    await result.current.submitTextForMode(text);
  });
  await waitFor(() => expect(result.current.chat.chatReply).toBe(reply));
}

describe("voice <-> text reply masking regression", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("a text reply after a voice turn replaces the displayed answer (not masked by the old voice reply)", async () => {
    const { result } = renderMoHarness();

    await doVoiceTurn(result, "VOICE_ANSWER_1");
    expect(result.current.displayedReply).toBe("VOICE_ANSWER_1");

    await doTextTurn(result, "what about now?", "TEXT_ANSWER_1");

    // The bug: without resetReply(), voice.reply ("VOICE_ANSWER_1") would
    // still win `reply || chatReply` and mask the brand-new text answer.
    expect(result.current.displayedReply).toBe("TEXT_ANSWER_1");
    expect(result.current.voice.reply).toBe("");
    expect(result.current.voice.transcript).toBe("");
    expect(result.current.displayedTranscript).toBe("");
  });

  it("a voice reply after a text turn replaces the displayed answer (not masked by the old text reply)", async () => {
    const { result } = renderMoHarness();

    await doTextTurn(result, "hello", "TEXT_ANSWER_2");
    expect(result.current.displayedReply).toBe("TEXT_ANSWER_2");

    await doVoiceTurn(result, "VOICE_ANSWER_2");

    // The bug (reverse direction): without resetChat() before starting the
    // voice turn, chat.chatReply ("TEXT_ANSWER_2") would still win
    // `reply || chatReply` and mask the brand-new voice answer.
    expect(result.current.displayedReply).toBe("VOICE_ANSWER_2");
    expect(result.current.chat.chatReply).toBe("");
  });

  it("interleaves several turns and always shows only the latest reply", async () => {
    const { result } = renderMoHarness();

    await doVoiceTurn(result, "V1");
    expect(result.current.displayedReply).toBe("V1");

    await doTextTurn(result, "t1", "T1");
    expect(result.current.displayedReply).toBe("T1");

    await doTextTurn(result, "t2", "T2");
    expect(result.current.displayedReply).toBe("T2");

    await doVoiceTurn(result, "V2");
    expect(result.current.displayedReply).toBe("V2");
  });
});
