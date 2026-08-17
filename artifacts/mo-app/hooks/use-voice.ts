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
      // Strip the data URL prefix — keep only the base64 payload
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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

// expo-audio recording options — New Architecture compatible.
// expo-av Audio.Recording produces empty files / crashes on Fabric (newArchEnabled=true).
const RECORDING_OPTIONS: EARecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: false,   // not needed — using forDuration auto-stop
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

// Fixed recording duration in seconds.
// record({ forDuration }) auto-stops the recorder after this many seconds
// without any metering / VAD complexity. The statusListener then fires and
// triggers stopAndProcess() exactly once.
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

  // Answer audio source — drives useAudioPlayer (New Architecture safe)
  const [answerSource, setAnswerSource] = useState<string | null>(null);

  // ── expo-audio recorder ───────────────────────────────────────────────────
  // statusListener fires whenever recorder status changes.
  // When the forDuration recording naturally stops, we trigger stopAndProcess.
  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status: RecordingStatus) => {
    // Only auto-trigger if:
    //  - recorder stopped naturally (not isRecording)
    //  - a recording session is active (guards against spurious events)
    //  - state is still "listening" (prevents double-fires if user tapped stop)
    if (status.isFinished && recordingActive.current && stateRef.current === "listening") {
      console.log("[Mo] statusListener — recorder stopped naturally, triggering stopAndProcess");
      stopAndProcessRef.current?.();
    }
  });

  const recordingActive = useRef(false);
  const stateRef        = useRef<AssistantState>("idle");
  const inflightRef     = useRef(false);
  const fetchAbortRef   = useRef<AbortController | null>(null);

  // Ref to stopAndProcess — lets startRecording's closure always call the
  // latest version without circular dependencies.
  const stopAndProcessRef = useRef<(() => void) | null>(null);

  // Playback tracking refs
  const isPlayingAnswerRef  = useRef(false);
  const playbackStartedRef  = useRef(false);

  // ── expo-audio player ─────────────────────────────────────────────────────
  // useAudioPlayer is a hook so it must live here at the top level.
  // answerSource drives which file is loaded; setting it to a URI triggers
  // the player to load the file, then our useEffect calls play().
  const answerPlayer       = useAudioPlayer(answerSource);
  const answerPlayerStatus = useAudioPlayerStatus(answerPlayer);

  const setStateSync = (s: AssistantState) => {
    stateRef.current = s;
    setState(s);
  };

  // ── Playback lifecycle effects ────────────────────────────────────────────

  // 1. Detect when playback actually starts (playing goes true)
  useEffect(() => {
    if (isPlayingAnswerRef.current && answerPlayerStatus.playing) {
      playbackStartedRef.current = true;
    }
  }, [answerPlayerStatus.playing]);

  // 2. Detect when playback finishes (playing goes false AFTER having been true)
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

  // 3. Auto-play when source is set and player is loaded (isLoaded goes true)
  useEffect(() => {
    if (
      answerSource &&
      isPlayingAnswerRef.current &&
      answerPlayerStatus.isLoaded &&
      !answerPlayerStatus.playing &&
      !playbackStartedRef.current   // don't restart after finishing
    ) {
      console.log("[Mo] Player loaded — starting answer playback");
      setStateSync("speaking");
      answerPlayer.play();
    }
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

      // Stop any stale recording from a previous session
      if (recordingActive.current) {
        console.log("[Mo] startRecording — stopping stale recording");
        try { await recorder.stop(); } catch { /* already stopped */ }
        recordingActive.current = false;
      }

      if (Platform.OS !== "web") {
        await setAudioModeEA({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      }

      await recorder.prepareToRecordAsync();

      // Auto-stops after RECORD_DURATION_S seconds.
      // The statusListener (passed to useAudioRecorder above) fires when the
      // recorder stops and calls stopAndProcess() — no VAD or timers needed.
      if (Platform.OS === "web") {
        recorder.record();
        // Web fallback: manual timeout since forDuration isn't always supported
        setTimeout(() => {
          if (stateRef.current === "listening") {
            stopAndProcessRef.current?.();
          }
        }, RECORD_DURATION_S * 1000);
      } else {
        recorder.record({ forDuration: RECORD_DURATION_S });
      }

      recordingActive.current = true;
      console.log("[Mo] recording started — will auto-stop in", RECORD_DURATION_S, "s");
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

  // ── stopAndProcess ────────────────────────────────────────────────────────
  const stopAndProcess = useCallback(async () => {
    console.log("[Mo] stopAndProcess — state:", stateRef.current, "inflight:", inflightRef.current);

    if (!recordingActive.current) {
      console.log("[Mo] stopAndProcess — no active recording, returning");
      return;
    }

    // Inflight guard — prevents duplicate requests from rapid taps or the
    // statusListener firing at the same time as a manual stop.
    if (inflightRef.current) {
      console.log("[Mo] stopAndProcess — inflight guard blocked, skipping");
      return;
    }

    // Hoisted for the catch block
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

      // Show "Thinking..." immediately
      setStateSync("thinking");
      inflightRef.current = true;

      // Stop any currently playing answer before starting a new request
      if (answerPlayer.playing) {
        answerPlayer.pause();
      }
      setAnswerSource(null);
      isPlayingAnswerRef.current = false;
      playbackStartedRef.current = false;

      // Switch audio mode and read file in parallel — saves ~100 ms.
      const [audioBase64] = await Promise.all([
        Platform.OS === "web"
          ? readBlobAsBase64(uri)
          : FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            }),
        Platform.OS !== "web"
          ? setAudioModeEA({
              allowsRecording: false,
              playsInSilentMode: true,
            })
          : Promise.resolve(),
      ]);

      const audioFormat = Platform.OS === "web" ? "webm" : "m4a";

      // Last 10 conversation turns for continuity
      const recentHistory = conversationHistory.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Serialize memories for the API
      const memoriesForApi = memories.map((m) => ({
        id: m.id,
        category: m.category,
        key: m.key,
        value: m.value,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      // Serialize pending tasks for the API
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

      // Serialize upcoming reminders for the API (exclude completed + past)
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

      // Serialize recent notes for the API (most recent first, last 10)
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

      // Map app-mode names to the API enum values accepted by MoVoiceBody.
      const API_MODE_MAP: Record<string, string> = {
        daily:        "planner",
        executive:    "executive",
        luxury:       "creative",
        creative:     "creative",
        motivational: "motivational",
        planner:      "planner",
      };
      const apiMode = API_MODE_MAP[mode] ?? "executive";

      console.log("[Mo] sending request to:", `${BASE_URL}/api/mo/voice`, "mode:", mode, "→", apiMode);

      const response = await fetch(`${BASE_URL}/api/mo/voice`, {
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
      }).finally(() => clearTimeout(fetchTimeoutId));

      // Clear the abort ref — request completed (success or HTTP error)
      fetchAbortRef.current = null;

      console.log("[Mo] response status:", response.status, "ok:", response.ok);

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

      const data: {
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
      } = await response.json();

      const { transcript: tx, reply: rp, audioBase64: audiob64 } = data;

      console.log("[Mo] API response — transcript:", JSON.stringify(tx), "reply length:", rp?.length ?? 0, "hasAudio:", !!audiob64);

      // Abort if user stopped manually (or cleanup ran) while we were waiting
      if (!inflightRef.current) return;

      if (!tx?.trim() || !rp) {
        console.warn("[Mo] Empty transcript or reply — tx:", JSON.stringify(tx), "rp:", JSON.stringify(rp));
        setErrorMessage("Didn't catch that — tap to try again.");
        setStateSync("error");
        setTimeout(() => setStateSync("idle"), 3_000);
        return;
      }

      // Valid transcript received — clear any stale error
      setErrorMessage("");
      setTranscript(tx);
      setReply(rp);
      console.log("[Mo] transcript:", JSON.stringify(tx), "| reply set");

      // Fire side effects
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

      if (!autoplay || !audiob64) {
        setStateSync("idle");
        inflightRef.current = false;
        return;
      }

      // Write answer audio to the local cache
      let audioUri: string;
      if (Platform.OS === "web") {
        audioUri = `data:audio/mpeg;base64,${audiob64}`;
      } else {
        const audioPath = `${FileSystem.cacheDirectory}mo-reply-${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(audioPath, audiob64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        audioUri = audioPath;
        console.log("[Mo] Audio written to:", audioUri);
      }

      // Hand off to the expo-audio player.
      // Setting answerSource triggers the hook to load the file.
      // The useEffect above detects isLoaded, transitions to "speaking",
      // calls play(), then detects completion and returns to idle.
      isPlayingAnswerRef.current = true;
      playbackStartedRef.current = false;
      setAnswerSource(audioUri);
      console.log("[Mo] answerSource set — player will auto-play when loaded");

    } catch (err: any) {
      // Always clear the abort ref so the next session is not blocked
      fetchAbortRef.current = null;
      inflightRef.current = false;

      // If cleanup already reset state to idle, suppress the error UI
      if (stateRef.current === "idle") {
        console.log("[Mo] catch — state already idle (cleanup ran), suppressing error UI");
        return;
      }

      // React Native / Hermes throws "Network request failed" when AbortController
      // aborts a fetch. Check signal.aborted to classify timeouts correctly.
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
  }, [mode, conversationHistory, memories, tasks, reminders, notes, preferences, autoplay, callbacks, answerPlayer]);

  // Keep the ref current so the statusListener always calls the latest version
  // of stopAndProcess (avoids stale-closure issues with hook dependencies).
  useEffect(() => {
    stopAndProcessRef.current = stopAndProcess;
  }, [stopAndProcess]);

  // ── Cleanup helper — tears down all live resources ────────────────────────
  // Used both by the AppState listener and the unmount cleanup.
  // IMPORTANT: must NOT call setStateSync — may be called while unmounting.
  const cleanupRef = useRef<((resetState: boolean) => Promise<void>) | undefined>(undefined);
  cleanupRef.current = async (resetState: boolean) => {
    console.log("[Mo] cleanup — resetState:", resetState);

    // Abort any in-flight fetch
    if (fetchAbortRef.current) {
      console.log("[Mo] cleanup — aborting stale fetch");
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }

    if (recordingActive.current) {
      console.log("[Mo] cleanup — stopping stale recording");
      try { await recorder.stop(); } catch { /* ignore */ }
      recordingActive.current = false;
    }

    // Stop expo-audio player if playing
    if (answerPlayer.playing) {
      try { answerPlayer.pause(); } catch { /* ignore */ }
    }
    setAnswerSource(null);
    isPlayingAnswerRef.current = false;
    playbackStartedRef.current = false;

    // Always reset the inflight guard so the next session can send requests.
    inflightRef.current = false;

    if (resetState) {
      stateRef.current = "idle";
      setState("idle");
    }
  };

  // ── AppState listener — reset on foreground ───────────────────────────────
  useEffect(() => {
    console.log("[Mo] mounting — registering AppState listener");

    const handleAppStateChange = (next: AppStateStatus) => {
      console.log("[Mo] AppState changed →", next);
      if (next === "active") {
        console.log("[Mo] app foregrounded — resetting to idle");
        cleanupRef.current?.(true).catch(() => {});
      } else if (next === "background" || next === "inactive") {
        console.log("[Mo] app backgrounded — tearing down and returning to idle");
        cleanupRef.current?.(true).catch(() => {});
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      console.log("[Mo] unmounting — removing AppState listener");
      subscription.remove();
      cleanupRef.current?.(false).catch(() => {});
    };
  }, []);

  // ── stopSpeaking — user taps mic while in speaking state ─────────────────
  const stopSpeaking = useCallback(async () => {
    console.log("[Mo] stopSpeaking");
    // Stop the expo-audio player
    if (answerPlayer.playing) {
      try { answerPlayer.pause(); } catch { /* ignore */ }
    }
    setAnswerSource(null);
    isPlayingAnswerRef.current = false;
    playbackStartedRef.current = false;
    // Abort any in-flight fetch
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    inflightRef.current = false;
    setStateSync("idle");
  }, [answerPlayer]);

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
