import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
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
export type AssistantMode = "executive" | "creative" | "motivational" | "planner";
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

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  // Enable metering so we can read dBFS levels for silence detection
  isMeteringEnabled: true,
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

// ── Silence detection thresholds ─────────────────────────────────────────────

// Metering values are in dBFS (0 = full scale, -160 = silence)
const SPEECH_THRESHOLD_DB  = -35; // above this = user is speaking
const SILENCE_THRESHOLD_DB = -42; // below this = silence
const SILENCE_FRAMES       = 7;   // 7 × 200 ms = 1.4 s of sustained silence
const MAX_RECORD_MS        = 30_000; // absolute cap before auto-stop

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
  const [mode, setMode] = useState<AssistantMode>("executive");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const stateRef = useRef<AssistantState>("idle");

  // Silence-detection timers
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref to stopAndProcess so startRecording can call it without a circular dep
  const stopAndProcessRef = useRef<(() => void) | null>(null);

  const setStateSync = (s: AssistantState) => {
    stateRef.current = s;
    setState(s);
  };

  const clearRecordingTimers = () => {
    if (silenceIntervalRef.current !== null) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (maxDurationTimerRef.current !== null) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setErrorMessage("Microphone permission denied.");
        setStateSync("error");
        setTimeout(() => setStateSync("idle"), 3000);
        return;
      }

      if (Platform.OS !== "web") {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;
      setTranscript("");
      setReply("");
      setStateSync("listening");

      // ── Silence detection (native only — web has no metering) ────────────
      if (Platform.OS !== "web") {
        let speechDetected = false;
        let silenceFrameCount = 0;

        silenceIntervalRef.current = setInterval(async () => {
          if (stateRef.current !== "listening") {
            clearRecordingTimers();
            return;
          }
          try {
            const status = await recording.getStatusAsync();
            const db: number = (status as any).metering ?? -160;

            if (!speechDetected) {
              // Wait until user actually starts speaking before monitoring silence
              if (db > SPEECH_THRESHOLD_DB) {
                speechDetected = true;
                silenceFrameCount = 0;
              }
            } else {
              if (db < SILENCE_THRESHOLD_DB) {
                silenceFrameCount++;
                if (silenceFrameCount >= SILENCE_FRAMES) {
                  // Enough silence after speech — auto-stop
                  clearRecordingTimers();
                  stopAndProcessRef.current?.();
                }
              } else {
                // Still talking — reset the silence counter
                silenceFrameCount = 0;
              }
            }
          } catch {
            // Metering read failed — ignore and keep polling
          }
        }, 200);
      }

      // Absolute max-duration safety net for both native and web
      maxDurationTimerRef.current = setTimeout(() => {
        clearRecordingTimers();
        if (stateRef.current === "listening") {
          stopAndProcessRef.current?.();
        }
      }, MAX_RECORD_MS);

    } catch (err) {
      console.error("Failed to start recording:", err);
      setErrorMessage("Could not start recording.");
      setStateSync("error");
      setTimeout(() => setStateSync("idle"), 3000);
    }
  }, []);

  const stopAndProcess = useCallback(async () => {
    // Cancel any running silence / max-duration timers
    clearRecordingTimers();

    const recording = recordingRef.current;
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (Platform.OS !== "web") {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      }

      if (!uri) {
        setStateSync("idle");
        return;
      }

      setStateSync("thinking");

      // On web the URI is a blob: URL — use fetch + FileReader instead of expo-file-system
      const audioBase64 =
        Platform.OS === "web"
          ? await readBlobAsBase64(uri)
          : await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

      // Web records in WebM; native records in m4a — Whisper accepts both
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

      const response = await fetch(`${BASE_URL}/api/mo/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: audioBase64,
          format: audioFormat,
          mode,
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
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as any)?.error ?? `Server error ${response.status}`);
      }

      const data = (await response.json()) as {
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
      };

      const { transcript: tx, reply: rp, audioBase64: audiob64 } = data;

      if (!tx?.trim() || !rp) {
        setStateSync("idle");
        return;
      }

      setTranscript(tx);
      setReply(rp);

      // Handle side effects from tool calls
      if (data.note?.content) {
        callbacks?.onNote?.({ content: data.note.content, title: data.note.title, category: data.note.category });
      }
      if (data.noteAction) {
        callbacks?.onNoteAction?.(data.noteAction);
      }
      if (data.reminder) {
        callbacks?.onReminder?.(data.reminder);
      }
      if (data.reminderAction) {
        callbacks?.onReminderAction?.(data.reminderAction);
      }
      if (data.memoryAction) {
        callbacks?.onMemoryAction?.(data.memoryAction);
      }
      if (data.plan) {
        callbacks?.onPlan?.({ ...data.plan, generatedAt: Date.now() });
      }
      if (data.taskAction) {
        callbacks?.onTaskAction?.(data.taskAction);
      }

      // Notify parent of completed turn
      callbacks?.onTurnComplete?.(tx, rp);

      // Play audio if autoplay and audio provided
      if (!autoplay || !audiob64) {
        setStateSync("idle");
        return;
      }

      // Natural pre-speech pause
      await new Promise<void>((resolve) => setTimeout(resolve, 600));

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // On web: play directly from a data URI — no file system write needed
      // On native: write to cache first (expo-av requires a file URI on native)
      let audioUri: string;
      if (Platform.OS === "web") {
        audioUri = `data:audio/mpeg;base64,${audiob64}`;
      } else {
        const audioPath = `${FileSystem.cacheDirectory}mo-reply.mp3`;
        await FileSystem.writeAsStringAsync(audioPath, audiob64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        audioUri = audioPath;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: false }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if ("didJustFinish" in status && status.didJustFinish) {
          setStateSync("idle");
          sound.unloadAsync();
        }
      });

      setStateSync("speaking");
      await sound.playAsync();
    } catch (err: any) {
      console.error("Voice pipeline error:", err);
      setErrorMessage(err?.message ?? "Something went wrong.");
      setStateSync("error");
      setTimeout(() => setStateSync("idle"), 3000);
    }
  }, [mode, conversationHistory, memories, tasks, reminders, preferences, autoplay, callbacks]);

  // Keep the ref current so startRecording's interval always calls the
  // latest version of stopAndProcess (avoids stale-closure issues).
  useEffect(() => {
    stopAndProcessRef.current = stopAndProcess;
  }, [stopAndProcess]);

  const stopSpeaking = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      soundRef.current = null;
    }
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
