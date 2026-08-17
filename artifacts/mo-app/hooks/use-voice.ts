import { Audio } from "expo-av";                    // filler playback only (bundled assets)
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync as setAudioModeEA,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions as EARecordingOptions,
  type RecordingStatus,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import type { MemoryItem, Task } from "@/context/AppContext";
import type { Note } from "@/hooks/use-notes";
import type { Reminder } from "@/hooks/use-reminders";

// ── Web-compatible base64 reader ─────────────────────────────────────────────

async function readBlobAsBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Filler phrase assets ──────────────────────────────────────────────────────
// Pre-generated MP3s in Mo's voice. Played immediately after the user stops
// speaking so the processing gap isn't silent. expo-av works for bundled assets
// (require()) on all architectures including New Architecture.

const FILLER_ASSETS = [
  require("../assets/fillers/filler-01.mp3"),
  require("../assets/fillers/filler-02.mp3"),
  require("../assets/fillers/filler-03.mp3"),
  require("../assets/fillers/filler-04.mp3"),
  require("../assets/fillers/filler-05.mp3"),
  require("../assets/fillers/filler-06.mp3"),
  require("../assets/fillers/filler-07.mp3"),
  require("../assets/fillers/filler-08.mp3"),
  require("../assets/fillers/filler-09.mp3"),
  require("../assets/fillers/filler-10.mp3"),
];

export type AssistantState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";
export type AssistantMode = "executive" | "creative" | "motivational" | "planner" | "daily" | "luxury";
export type ResponseLength = "short" | "medium" | "long";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UserPreferences {
  name?: string;
  location?: string;
  timezone?: string;
  responseLength?: ResponseLength;
}

export interface MemoryActionPayload {
  action: "save" | "delete";
  category?: string;
  key: string;
  value?: string;
}

export interface TaskActionPayload {
  action: "add" | "complete" | "delete";
  title: string;
  dueDate?: string;
  category?: string;
}

export interface ReminderActionPayload {
  action: "delete" | "dismiss";
  title: string;
}

export interface NotePayload {
  content: string;
  title?: string;
  category?: string;
}

export interface NoteActionPayload {
  action: "delete";
  keyword: string;
}

export interface PlanBlock {
  time?: string;
  title: string;
  description?: string;
  type: "task" | "reminder" | "focus" | "break" | "routine";
  priority?: "high" | "medium" | "low";
}

export interface DayPlan {
  title: string;
  timeframe: "morning" | "afternoon" | "evening" | "full_day";
  blocks: PlanBlock[];
  generatedAt: number;
}

export interface VoiceCallbacks {
  onNote?: (note: NotePayload) => void;
  onNoteAction?: (action: NoteActionPayload) => void;
  onReminder?: (params: { title: string; content: string; datetime: string }) => void;
  onReminderAction?: (action: ReminderActionPayload) => void;
  onMemoryAction?: (action: MemoryActionPayload) => void;
  onTaskAction?: (action: TaskActionPayload) => void;
  onPlan?: (plan: DayPlan) => void;
  onTurnComplete?: (transcript: string, reply: string) => void;
}

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
console.log("[Mo] BASE_URL configured:", BASE_URL);

// expo-audio recording options — New Architecture (Fabric) compatible.
const RECORDING_OPTIONS: EARecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: false,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

// Fixed recording duration. record({ forDuration }) tells the native recorder
// to stop automatically after N seconds. The statusListener (isFinished) fires
// and triggers stopAndProcess() without any VAD / polling loop.
const RECORD_DURATION_S = 6;

interface UseVoiceOptions {
  conversationHistory?: ConversationMessage[];
  memories?: MemoryItem[];
  tasks?: Task[];
  reminders?: Reminder[];
  notes?: Note[];
  preferences?: UserPreferences;
  autoplay?: boolean;
  callbacks?: VoiceCallbacks;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const {
    conversationHistory = [],
    memories = [],
    tasks = [],
    reminders = [],
    notes = [],
    preferences,
    autoplay = true,
    callbacks,
  } = options;

  const [state, setState] = useState<AssistantState>("idle");
  const [mode, setMode] = useState<AssistantMode>("daily");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Answer audio source — drives useAudioPlayer (expo-audio, New Architecture safe).
  // expo-av Audio.Sound works for bundled require() assets (filler) but can fail
  // for local file:// URIs on New Architecture (answer audio). expo-audio handles both.
  const [answerSource, setAnswerSource] = useState<string | null>(null);

  // ── expo-audio recorder ───────────────────────────────────────────────────
  // The statusListener fires when recording status changes, including when the
  // forDuration timer expires. We use this to auto-trigger stopAndProcess.
  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status: RecordingStatus) => {
    if (status.isFinished && recordingActive.current && stateRef.current === "listening") {
      console.log("[Mo] statusListener — recorder finished naturally, triggering stopAndProcess");
      stopAndProcessRef.current?.();
    }
  });

  const recordingActive = useRef(false);
  const stateRef        = useRef<AssistantState>("idle");
  const inflightRef     = useRef(false);
  const fetchAbortRef   = useRef<AbortController | null>(null);
  const stopAndProcessRef = useRef<(() => void) | null>(null);

  // Filler sound (expo-av, bundled assets — works on all architectures)
  const fillerSoundRef  = useRef<Audio.Sound | null>(null);

  // Playback tracking
  const isPlayingAnswerRef  = useRef(false);
  const playbackStartedRef  = useRef(false);

  // ── expo-audio player (answer audio) ─────────────────────────────────────
  const answerPlayer       = useAudioPlayer(answerSource);
  const answerPlayerStatus = useAudioPlayerStatus(answerPlayer);

  // Always-current ref to the player — prevents stale closures in effects and
  // callbacks when answerSource changes and useAudioPlayer returns a new instance.
  const answerPlayerRef = useRef(answerPlayer);
  answerPlayerRef.current = answerPlayer;   // update on every render (synchronous)

  const setStateSync = (s: AssistantState) => {
    stateRef.current = s;
    setState(s);
  };

  // ── Playback lifecycle effects ────────────────────────────────────────────

  // 1. Detect when answer playback actually starts
  useEffect(() => {
    if (isPlayingAnswerRef.current && answerPlayerStatus.playing) {
      playbackStartedRef.current = true;
      console.log("[Mo] Answer playback started");
    }
  }, [answerPlayerStatus.playing]);

  // 2. Detect when answer playback finishes
  useEffect(() => {
    if (playbackStartedRef.current && !answerPlayerStatus.playing) {
      console.log("[Mo] Answer playback finished — returning to idle");
      playbackStartedRef.current = false;
      isPlayingAnswerRef.current = false;
      inflightRef.current = false;
      setStateSync("idle");
      setAnswerSource(null);
    }
  }, [answerPlayerStatus.playing]);

  // 3. Auto-play when player is loaded and we're waiting to play
  useEffect(() => {
    if (
      answerSource &&
      isPlayingAnswerRef.current &&
      answerPlayerStatus.isLoaded &&
      !answerPlayerStatus.playing &&
      !playbackStartedRef.current
    ) {
      console.log("[Mo] Player loaded — starting answer playback via ref");
      setStateSync("speaking");
      // Use ref to call the CURRENT player, not the one captured at effect-creation time.
      answerPlayerRef.current.play();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerSource, answerPlayerStatus.isLoaded, answerPlayerStatus.playing]);

  // ── startRecording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    console.log("[Mo] startRecording — state:", stateRef.current, "inflight:", inflightRef.current);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      console.log("[Mo] mic permission granted:", granted);
      if (!granted) {
        setErrorMessage("Microphone permission denied.");
        setStateSync("error");
        setTimeout(() => setStateSync("idle"), 3000);
        return;
      }

      if (recordingActive.current) {
        console.log("[Mo] startRecording — stopping stale recording");
        try { await recorder.stop(); } catch { /* already stopped */ }
        recordingActive.current = false;
      }

      if (Platform.OS !== "web") {
        await setAudioModeEA({ allowsRecording: true, playsInSilentMode: true });
      }

      await recorder.prepareToRecordAsync();

      if (Platform.OS === "web") {
        // Web: no native forDuration support — use a manual fallback timer
        recorder.record();
        setTimeout(() => {
          if (stateRef.current === "listening") {
            stopAndProcessRef.current?.();
          }
        }, RECORD_DURATION_S * 1000);
      } else {
        // Native: auto-stops after RECORD_DURATION_S; statusListener fires
        recorder.record({ forDuration: RECORD_DURATION_S });
      }

      recordingActive.current = true;
      console.log("[Mo] recording started — auto-stops in", RECORD_DURATION_S, "s");
      setTranscript("");
      setReply("");
      setErrorMessage("");
      setStateSync("listening");

    } catch (err) {
      console.error("[Mo] startRecording FAILED:", err);
      setErrorMessage("Could not start recording.");
      setStateSync("error");
      setTimeout(() => setStateSync("idle"), 3000);
    }
  }, []);

  // ── playFillerAsync ───────────────────────────────────────────────────────
  // Plays a random pre-generated filler clip using expo-av (bundled assets work
  // reliably across all architectures). Transitions state to "speaking".
  // Returns a Promise that resolves when the clip finishes (or immediately on error)
  // so the caller can race it against the API response.
  const playFillerAsync = useCallback((): Promise<void> => {
    const idx = Math.floor(Math.random() * FILLER_ASSETS.length);

    return new Promise<void>((resolve) => {
      // Safety net: if didJustFinish never fires, resolve after 12 s
      const safetyTimeout = setTimeout(() => {
        console.warn("[Mo] Filler safety timeout fired");
        fillerSoundRef.current = null;
        resolve();
      }, 12_000);

      Audio.Sound.createAsync(FILLER_ASSETS[idx], { shouldPlay: false })
        .then(({ sound }) => {
          fillerSoundRef.current = sound;
          sound.setOnPlaybackStatusUpdate((status) => {
            if ("didJustFinish" in status && status.didJustFinish) {
              clearTimeout(safetyTimeout);
              fillerSoundRef.current = null;
              sound.unloadAsync().catch(() => {});
              resolve();
            }
          });
          setStateSync("speaking");
          return sound.playAsync();
        })
        .catch(() => {
          clearTimeout(safetyTimeout);
          fillerSoundRef.current = null;
          resolve();
        });
    });
  }, []);

  // ── stopAndProcess ────────────────────────────────────────────────────────
  const stopAndProcess = useCallback(async () => {
    console.log("[Mo] stopAndProcess — state:", stateRef.current, "inflight:", inflightRef.current);

    if (!recordingActive.current) {
      console.log("[Mo] stopAndProcess — no active recording, returning");
      return;
    }
    if (inflightRef.current) {
      console.log("[Mo] stopAndProcess — inflight guard, skipping");
      return;
    }

    let fetchController: AbortController | null = null;

    try {
      await recorder.stop();
      recordingActive.current = false;
      const uri = recorder.uri;
      console.log("[Mo] recorder.stop() done — uri:", uri);

      if (!uri) {
        setErrorMessage("No audio captured. Tap to try again.");
        setStateSync("error");
        setTimeout(() => setStateSync("idle"), 3_000);
        return;
      }

      setStateSync("thinking");
      inflightRef.current = true;

      // Stop any currently playing answer
      if (answerPlayerRef.current.playing) {
        answerPlayerRef.current.pause();
      }
      setAnswerSource(null);
      isPlayingAnswerRef.current = false;
      playbackStartedRef.current = false;

      // Stop any leftover filler
      if (fillerSoundRef.current) {
        await fillerSoundRef.current.stopAsync().catch(() => {});
        await fillerSoundRef.current.unloadAsync().catch(() => {});
        fillerSoundRef.current = null;
      }

      // Read audio file + switch audio mode in parallel
      const [audioBase64] = await Promise.all([
        Platform.OS === "web"
          ? readBlobAsBase64(uri)
          : FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
        Platform.OS !== "web"
          ? setAudioModeEA({ allowsRecording: false, playsInSilentMode: true })
          : Promise.resolve(),
      ]);

      const audioFormat = Platform.OS === "web" ? "webm" : "m4a";

      const recentHistory = conversationHistory.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const memoriesForApi = memories.map((m) => ({
        id: m.id,
        category: m.category,
        key: m.key,
        value: m.value,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      const tasksForApi = tasks
        .filter((t) => t.status === "pending")
        .map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          status: t.status,
          category: t.category,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));

      const now = Date.now();
      const remindersForApi = reminders
        .filter((r) => !r.completed && new Date(r.datetime).getTime() > now)
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          datetime: r.datetime,
        }));

      const notesForApi = notes.slice(0, 10).map((n) => ({
        id: n.id,
        content: n.content,
        title: n.title,
        category: n.category,
        timestamp: n.timestamp,
      }));

      fetchController = new AbortController();
      fetchAbortRef.current = fetchController;
      const fetchTimeoutId = setTimeout(() => fetchController!.abort(), 28_000);

      const API_MODE_MAP: Record<string, string> = {
        daily:        "planner",
        executive:    "executive",
        luxury:       "creative",
        creative:     "creative",
        motivational: "motivational",
        planner:      "planner",
      };
      const apiMode = API_MODE_MAP[mode] ?? "executive";

      console.log("[Mo] sending request — mode:", mode, "→", apiMode);

      // ── Filler + API race ─────────────────────────────────────────────────
      // Run filler and API fetch concurrently. Real answer plays only after
      // BOTH finish — guaranteeing no overlap between filler and answer audio.
      const apiPromise: Promise<string | null> = fetch(`${BASE_URL}/api/mo/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: fetchController.signal,
        body: JSON.stringify({
          audio: audioBase64,
          format: audioFormat,
          mode: apiMode,
          messages: recentHistory,
          memories: memoriesForApi,
          tasks: tasksForApi,
          reminders: remindersForApi,
          notes: notesForApi,
          preferences: preferences
            ? {
                name: preferences.name,
                location: preferences.location,
                timezone: preferences.timezone,
                responseLength: preferences.responseLength,
              }
            : undefined,
        }),
      })
        .finally(() => clearTimeout(fetchTimeoutId))
        .then(async (response) => {
          console.log("[Mo] response status:", response.status);
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const serverMsg = (body as any)?.error;
            let friendlyMsg: string;
            if (response.status === 502 || response.status === 503) {
              friendlyMsg = serverMsg ?? "Service temporarily unavailable. Please try again.";
            } else if (response.status === 504) {
              friendlyMsg = serverMsg ?? "Request timed out. Please try again.";
            } else {
              friendlyMsg = serverMsg ?? `Something went wrong (${response.status}). Please try again.`;
            }
            throw new Error(friendlyMsg);
          }
          return response.json();
        })
        .then(async (data: {
          transcript: string;
          reply: string;
          audioBase64: string;
          functionCalled?: string;
          reminder?: { title: string; content: string; datetime: string };
          reminderAction?: ReminderActionPayload;
          note?: NotePayload;
          noteAction?: NoteActionPayload;
          memoryAction?: MemoryActionPayload;
          taskAction?: TaskActionPayload;
          plan?: Omit<DayPlan, "generatedAt">;
        }) => {
          const { transcript: tx, reply: rp, audioBase64: audiob64 } = data;
          console.log("[Mo] API — transcript:", JSON.stringify(tx), "reply:", rp?.length ?? 0, "chars, hasAudio:", !!audiob64);

          if (!tx?.trim() || !rp) {
            console.warn("[Mo] Empty transcript or reply");
            setErrorMessage("Didn't catch that — tap to try again.");
            setStateSync("error");
            setTimeout(() => setStateSync("idle"), 3_000);
            return null;
          }

          setErrorMessage("");
          setTranscript(tx);
          setReply(rp);

          if (data.note?.content) {
            callbacks?.onNote?.({ content: data.note.content, title: data.note.title, category: data.note.category });
          }
          if (data.noteAction)     callbacks?.onNoteAction?.(data.noteAction);
          if (data.reminder)       callbacks?.onReminder?.(data.reminder);
          if (data.reminderAction) callbacks?.onReminderAction?.(data.reminderAction);
          if (data.memoryAction)   callbacks?.onMemoryAction?.(data.memoryAction);
          if (data.plan)           callbacks?.onPlan?.({ ...data.plan, generatedAt: Date.now() });
          if (data.taskAction)     callbacks?.onTaskAction?.(data.taskAction);
          callbacks?.onTurnComplete?.(tx, rp);

          if (!autoplay || !audiob64) return null;

          // Write answer audio to local cache while filler may still be playing
          let audioUri: string;
          if (Platform.OS === "web") {
            audioUri = `data:audio/mpeg;base64,${audiob64}`;
          } else {
            const audioPath = `${FileSystem.cacheDirectory}mo-reply-${Date.now()}.mp3`;
            await FileSystem.writeAsStringAsync(audioPath, audiob64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            audioUri = audioPath;
            console.log("[Mo] Answer audio written to:", audioUri);
          }
          return audioUri;
        });

      // Wait for BOTH filler to finish AND API to respond
      const [, answerUri] = await Promise.all([playFillerAsync(), apiPromise]);

      fetchAbortRef.current = null;

      if (!inflightRef.current) return;   // user tapped stop while we waited

      if (!answerUri) {
        // Empty transcript / error was already handled inside apiPromise.then()
        // If we reach here with null, just return to idle.
        if (stateRef.current !== "error") {
          setStateSync("idle");
          inflightRef.current = false;
        }
        return;
      }

      // ── Play the real answer via expo-audio ───────────────────────────────
      // Setting answerSource triggers useAudioPlayer to load the file.
      // Effect #3 above detects isLoaded and calls answerPlayerRef.current.play().
      // Effects #1 and #2 detect playback start and completion.
      console.log("[Mo] Starting answer playback — setting answerSource");
      isPlayingAnswerRef.current = true;
      playbackStartedRef.current = false;
      setAnswerSource(answerUri);

    } catch (err: any) {
      fetchAbortRef.current = null;
      inflightRef.current = false;

      if (stateRef.current === "idle") {
        console.log("[Mo] catch — already idle (cleanup ran)");
        return;
      }

      const isTimeout =
        err?.name === "AbortError" ||
        err?.name === "TimeoutError" ||
        fetchController?.signal.aborted === true;
      const msg = isTimeout
        ? "Request timed out. Please try again."
        : (err?.message ?? "Something went wrong. Please try again.");
      console.error("[Mo] Voice pipeline error:", err);
      setErrorMessage(msg);
      setStateSync("error");
      setTimeout(() => setStateSync("idle"), 4000);
    }
  }, [mode, conversationHistory, memories, tasks, reminders, notes, preferences, autoplay, callbacks, playFillerAsync]);

  useEffect(() => {
    stopAndProcessRef.current = stopAndProcess;
  }, [stopAndProcess]);

  // ── Cleanup helper ────────────────────────────────────────────────────────
  const cleanupRef = useRef<((resetState: boolean) => Promise<void>) | undefined>(undefined);
  cleanupRef.current = async (resetState: boolean) => {
    console.log("[Mo] cleanup — resetState:", resetState);

    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }

    if (recordingActive.current) {
      try { await recorder.stop(); } catch { /* ignore */ }
      recordingActive.current = false;
    }

    if (fillerSoundRef.current) {
      try {
        await fillerSoundRef.current.stopAsync();
        await fillerSoundRef.current.unloadAsync();
      } catch { /* ignore */ }
      fillerSoundRef.current = null;
    }

    if (answerPlayerRef.current.playing) {
      try { answerPlayerRef.current.pause(); } catch { /* ignore */ }
    }
    setAnswerSource(null);
    isPlayingAnswerRef.current = false;
    playbackStartedRef.current = false;

    inflightRef.current = false;

    if (resetState) {
      stateRef.current = "idle";
      setState("idle");
    }
  };

  // ── AppState listener ─────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[Mo] mounting — registering AppState listener");

    const handleAppStateChange = (next: AppStateStatus) => {
      console.log("[Mo] AppState changed →", next);
      if (next === "active") {
        cleanupRef.current?.(true).catch(() => {});
      } else if (next === "background" || next === "inactive") {
        cleanupRef.current?.(true).catch(() => {});
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
      cleanupRef.current?.(false).catch(() => {});
    };
  }, []);

  // ── stopSpeaking ──────────────────────────────────────────────────────────
  const stopSpeaking = useCallback(async () => {
    console.log("[Mo] stopSpeaking");

    if (fillerSoundRef.current) {
      await fillerSoundRef.current.stopAsync().catch(() => {});
      await fillerSoundRef.current.unloadAsync().catch(() => {});
      fillerSoundRef.current = null;
    }

    if (answerPlayerRef.current.playing) {
      try { answerPlayerRef.current.pause(); } catch { /* ignore */ }
    }
    setAnswerSource(null);
    isPlayingAnswerRef.current = false;
    playbackStartedRef.current = false;

    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    inflightRef.current = false;
    setStateSync("idle");
  }, []);

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s === "idle" || s === "error") startRecording();
    else if (s === "listening") stopAndProcess();
    else if (s === "speaking") stopSpeaking();
  }, [startRecording, stopAndProcess, stopSpeaking]);

  return {
    state,
    mode,
    setMode,
    transcript,
    reply,
    errorMessage,
    toggle,
    isIdle: state === "idle",
    isListening: state === "listening",
    isThinking: state === "thinking",
    isSpeaking: state === "speaking",
    isError: state === "error",
  };
}
