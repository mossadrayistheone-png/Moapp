import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useRef, useState } from "react";
import type { MemoryItem, Task } from "@/context/AppContext";
import type { Note } from "@/hooks/use-notes";
import type { Reminder } from "@/hooks/use-reminders";

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

export interface VoiceCallbacks {
  onNote?: (note: NotePayload) => void;
  onNoteAction?: (action: NoteActionPayload) => void;
  onReminder?: (params: { title: string; content: string; datetime: string }) => void;
  onReminderAction?: (action: ReminderActionPayload) => void;
  onMemoryAction?: (action: MemoryActionPayload) => void;
  onTaskAction?: (action: TaskActionPayload) => void;
  onTurnComplete?: (transcript: string, reply: string) => void;
}

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
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

  const setStateSync = (s: AssistantState) => {
    stateRef.current = s;
    setState(s);
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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;
      setTranscript("");
      setReply("");
      setStateSync("listening");
    } catch (err) {
      console.error("Failed to start recording:", err);
      setErrorMessage("Could not start recording.");
      setStateSync("error");
      setTimeout(() => setStateSync("idle"), 3000);
    }
  }, []);

  const stopAndProcess = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      if (!uri) {
        setStateSync("idle");
        return;
      }

      setStateSync("thinking");

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

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
          format: "m4a",
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

      const audioPath = `${FileSystem.cacheDirectory}mo-reply.mp3`;
      await FileSystem.writeAsStringAsync(audioPath, audiob64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Natural pre-speech pause
      await new Promise<void>((resolve) => setTimeout(resolve, 600));

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioPath },
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
