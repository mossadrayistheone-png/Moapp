/**
 * useRealtimeVoice
 *
 * Replaces the classic Whisper → GPT → ElevenLabs HTTP pipeline with a single
 * persistent WebSocket connection to the backend, which in turn uses the
 * OpenAI Realtime API (gpt-4o-realtime-preview).
 *
 * The pipeline collapses three sequential API calls into one streaming session,
 * cutting typical response latency from 4–8 s to 1–3 s.
 *
 * If the WebSocket connection cannot be established (network error, server
 * restart, etc.) the hook falls back transparently to the classic HTTP pipeline
 * via useVoice, preserving all UI behaviour.
 *
 * Drop-in replacement for useVoice — identical return type.
 */

import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { MemoryItem, Task } from "@/context/AppContext";
import type { Note } from "@/hooks/use-notes";
import type { Reminder } from "@/hooks/use-reminders";
import {
  useVoice,
  type AssistantMode,
  type AssistantState,
  type DayPlan,
  type MemoryActionPayload,
  type NoteActionPayload,
  type NotePayload,
  type ReminderActionPayload,
  type ResponseLength,
  type TaskActionPayload,
  type UserPreferences,
  type VoiceCallbacks,
  type ConversationMessage,
} from "@/hooks/use-voice";

// Re-export types so consumers can import them from this module, matching the
// old import site that used @/hooks/use-voice directly.
export type {
  AssistantMode,
  AssistantState,
  DayPlan,
  MemoryActionPayload,
  NoteActionPayload,
  NotePayload,
  ReminderActionPayload,
  ResponseLength,
  TaskActionPayload,
  UserPreferences,
  VoiceCallbacks,
  ConversationMessage,
} from "@/hooks/use-voice";

// ── Config ────────────────────────────────────────────────────────────────────

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const WS_URL  = `wss://${DOMAIN}/api/mo/realtime`;

// Max ms to wait for the first WebSocket event before deciding it's unreachable
const WS_CONNECT_TIMEOUT_MS = 6_000;
// How long to wait before declaring the realtime response timed out
const RESPONSE_TIMEOUT_MS = 30_000;

// Recording options — same as useVoice
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

// Silence detection thresholds — identical to useVoice
const SPEECH_THRESHOLD_DB  = -35;
const SILENCE_THRESHOLD_DB = -42;
const PEAK_DROP_DB         = 14;
const SILENCE_FRAMES       = 3;
const MAX_SPEECH_MS        = 8_000;
const MAX_RECORD_MS        = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseRealtimeVoiceOptions {
  conversationHistory?: ConversationMessage[];
  memories?: MemoryItem[];
  tasks?: Task[];
  reminders?: Reminder[];
  notes?: Note[];
  preferences?: UserPreferences;
  autoplay?: boolean;
  callbacks?: VoiceCallbacks;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRealtimeVoice(options: UseRealtimeVoiceOptions = {}) {
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

  // ── State ─────────────────────────────────────────────────────────────────

  const [state, setState] = useState<AssistantState>("idle");
  const [mode, setMode]   = useState<AssistantMode>("executive");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply]           = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const stateRef = useRef<AssistantState>("idle");

  // ── WebSocket connection ───────────────────────────────────────────────────

  const wsRef         = useRef<WebSocket | null>(null);
  const wsReadyRef    = useRef(false);
  const useFallbackRef = useRef(false);   // true → use classic HTTP pipeline

  // ── Recording refs ────────────────────────────────────────────────────────

  const recordingRef        = useRef<Audio.Recording | null>(null);
  const soundRef            = useRef<Audio.Sound | null>(null);
  const inflightRef         = useRef(false);
  const silenceIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAndProcessRef   = useRef<(() => void) | null>(null);
  const responseTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mode ref ──────────────────────────────────────────────────────────────

  const modeRef = useRef<AssistantMode>("executive");
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ── Stable options refs ───────────────────────────────────────────────────

  const callbacksRef        = useRef(callbacks);
  const memoriesRef         = useRef(memories);
  const tasksRef            = useRef(tasks);
  const remindersRef        = useRef(reminders);
  const notesRef            = useRef(notes);
  const preferencesRef      = useRef(preferences);
  const conversationRef     = useRef(conversationHistory);
  const autoplayRef         = useRef(autoplay);

  useEffect(() => { callbacksRef.current    = callbacks;           }, [callbacks]);
  useEffect(() => { memoriesRef.current     = memories;            }, [memories]);
  useEffect(() => { tasksRef.current        = tasks;               }, [tasks]);
  useEffect(() => { remindersRef.current    = reminders;           }, [reminders]);
  useEffect(() => { notesRef.current        = notes;               }, [notes]);
  useEffect(() => { preferencesRef.current  = preferences;         }, [preferences]);
  useEffect(() => { conversationRef.current = conversationHistory; }, [conversationHistory]);
  useEffect(() => { autoplayRef.current     = autoplay;            }, [autoplay]);

  // ── Fallback: classic useVoice hook ───────────────────────────────────────
  // Created unconditionally (Rules of Hooks) but only activated when the
  // WebSocket path fails.

  const fallback = useVoice({
    conversationHistory,
    memories,
    tasks,
    reminders,
    notes,
    preferences,
    autoplay,
    callbacks,
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const setStateSync = (s: AssistantState) => {
    stateRef.current = s;
    setState(s);
  };

  const clearRecordingTimers = () => {
    if (silenceIntervalRef.current !== null)  { clearInterval(silenceIntervalRef.current);  silenceIntervalRef.current  = null; }
    if (maxDurationTimerRef.current !== null) { clearTimeout(maxDurationTimerRef.current);  maxDurationTimerRef.current = null; }
  };

  const clearResponseTimer = () => {
    if (responseTimerRef.current !== null) { clearTimeout(responseTimerRef.current); responseTimerRef.current = null; }
  };

  const showError = (msg: string) => {
    clearResponseTimer();
    setErrorMessage(msg);
    setStateSync("error");
    inflightRef.current = false;
    setTimeout(() => setStateSync("idle"), 4_000);
  };

  // ── WebSocket setup ───────────────────────────────────────────────────────

  const connectWs = useCallback(() => {
    if (!DOMAIN || useFallbackRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return; // Already open/connecting

    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      connectTimer = setTimeout(() => {
        if (ws.readyState !== 1 /* OPEN */) {
          console.warn("[Realtime] WS connect timeout — falling back to classic pipeline");
          useFallbackRef.current = true;
          ws.close();
        }
      }, WS_CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
        wsReadyRef.current = true;
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(event.data as string); } catch { return; }

        switch (msg.type) {
          case "connected":
            wsReadyRef.current = true;
            break;

          case "transcript":
            setTranscript(msg.text as string ?? "");
            break;

          case "audio": {
            clearResponseTimer();
            const audioData = msg.data as string | undefined;
            if (!autoplayRef.current || !audioData) {
              setStateSync("idle");
              inflightRef.current = false;
              return;
            }
            void playAudioFromBase64(audioData, "audio/wav");
            break;
          }

          case "tool_result":
            applyToolResult(msg);
            break;

          case "done":
            // If we already received audio, the state was set to "speaking".
            // If not (e.g., tool-only turn with no spoken reply), go idle.
            if (stateRef.current !== "speaking") {
              setStateSync("idle");
              inflightRef.current = false;
            }
            break;

          case "error": {
            const errMsg = (msg.message as string | undefined) ?? "Something went wrong.";
            console.error("[Realtime] server error:", errMsg);
            showError(errMsg);
            break;
          }
        }
      };

      ws.onerror = () => {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
        console.warn("[Realtime] WS error — falling back to classic pipeline");
        useFallbackRef.current = true;
        wsReadyRef.current = false;
      };

      ws.onclose = () => {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
        wsReadyRef.current = false;
        wsRef.current = null;
      };
    } catch {
      useFallbackRef.current = true;
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWs]);

  // ── Tool-result side effects ──────────────────────────────────────────────

  const applyToolResult = (msg: Record<string, unknown>) => {
    const cb = callbacksRef.current;
    if (!cb) return;

    if (msg.note)           cb.onNote?.(msg.note as NotePayload);
    if (msg.noteAction)     cb.onNoteAction?.(msg.noteAction as NoteActionPayload);
    if (msg.reminder)       cb.onReminder?.(msg.reminder as { title: string; content: string; datetime: string });
    if (msg.reminderAction) cb.onReminderAction?.(msg.reminderAction as ReminderActionPayload);
    if (msg.memoryAction)   cb.onMemoryAction?.(msg.memoryAction as MemoryActionPayload);
    if (msg.taskAction)     cb.onTaskAction?.(msg.taskAction as TaskActionPayload);
    if (msg.plan) {
      const plan = msg.plan as Omit<DayPlan, "generatedAt">;
      cb.onPlan?.({ ...plan, generatedAt: Date.now() });
    }
  };

  // ── Audio playback from base64 WAV ────────────────────────────────────────

  const playAudioFromBase64 = async (base64: string, mimeType: string) => {
    try {
      // Unload any previously playing sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      let audioUri: string;
      if (Platform.OS === "web") {
        audioUri = `data:${mimeType};base64,${base64}`;
      } else {
        // Determine file extension from mimeType
        const ext = mimeType.includes("wav") ? "wav" : "mp3";
        const path = `${FileSystem.cacheDirectory}mo-rt-reply-${Date.now()}.${ext}`;
        await FileSystem.writeAsStringAsync(path, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        audioUri = path;
      }

      // Switch audio mode for playback on iOS
      if (Platform.OS !== "web") {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: false }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if ("didJustFinish" in status && status.didJustFinish) {
          setStateSync("idle");
          inflightRef.current = false;
          sound.unloadAsync().catch(() => {});
          // Notify parent of the completed turn
          callbacksRef.current?.onTurnComplete?.(transcript, reply);
        }
      });

      setStateSync("speaking");
      await sound.playAsync();
    } catch (err) {
      console.error("[Realtime] audio playback failed:", err);
      setStateSync("idle");
      inflightRef.current = false;
    }
  };

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    // If WS has permanently failed, delegate the full UI to the fallback hook
    if (useFallbackRef.current) {
      fallback.toggle();
      return;
    }

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setErrorMessage("Microphone permission denied.");
        setStateSync("error");
        setTimeout(() => setStateSync("idle"), 3_000);
        return;
      }

      if (Platform.OS !== "web") {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;

      setTranscript("");
      setReply("");
      setStateSync("listening");

      // Silence detection (native only)
      if (Platform.OS !== "web") {
        let speechDetected = false;
        let silenceFrameCount = 0;
        let peakDb = -160;

        silenceIntervalRef.current = setInterval(async () => {
          if (stateRef.current !== "listening") { clearRecordingTimers(); return; }
          try {
            const status = await recording.getStatusAsync() as unknown as Record<string, number>;
            const db: number = status.metering ?? -160;

            if (!speechDetected) {
              if (db > SPEECH_THRESHOLD_DB) {
                speechDetected = true;
                peakDb = db;
                silenceFrameCount = 0;
                setTimeout(() => {
                  if (stateRef.current === "listening") {
                    clearRecordingTimers();
                    stopAndProcessRef.current?.();
                  }
                }, MAX_SPEECH_MS);
              }
            } else {
              if (db > peakDb) peakDb = db;
              const isSilent = db < SILENCE_THRESHOLD_DB || peakDb - db >= PEAK_DROP_DB;
              if (isSilent) {
                silenceFrameCount++;
                if (silenceFrameCount >= SILENCE_FRAMES) {
                  clearRecordingTimers();
                  stopAndProcessRef.current?.();
                }
              } else {
                silenceFrameCount = 0;
              }
            }
          } catch { /* metering read failed */ }
        }, 200);
      }

      maxDurationTimerRef.current = setTimeout(() => {
        clearRecordingTimers();
        if (stateRef.current === "listening") stopAndProcessRef.current?.();
      }, MAX_RECORD_MS);

    } catch (err) {
      console.error("[Realtime] startRecording failed:", err);
      setErrorMessage("Could not start recording.");
      setStateSync("error");
      setTimeout(() => setStateSync("idle"), 3_000);
    }
  }, [fallback]);

  // ── Process audio after recording stops ───────────────────────────────────

  const stopAndProcess = useCallback(async () => {
    clearRecordingTimers();

    const recording = recordingRef.current;
    if (!recording) return;
    if (inflightRef.current) return;

    inflightRef.current = true;
    setStateSync("thinking");

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) { setStateSync("idle"); inflightRef.current = false; return; }

      // If WebSocket fell over during the recording, fall back immediately
      if (useFallbackRef.current) {
        inflightRef.current = false;
        fallback.toggle();
        return;
      }

      // Switch audio mode for playback; read audio file in parallel
      const [audioBase64] = await Promise.all([
        Platform.OS === "web"
          ? readBlobAsBase64(uri)
          : FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
        Platform.OS !== "web"
          ? Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })
          : Promise.resolve(),
      ]);

      const audioFormat = Platform.OS === "web" ? "webm" : "m4a";

      // Build context snapshot for the server
      const now = Date.now();
      const payload = {
        type: "voice",
        audio: audioBase64,
        format: audioFormat,
        mode: modeRef.current,
        messages: conversationRef.current.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        memories: memoriesRef.current.map((m) => ({
          id: m.id, category: m.category, key: m.key, value: m.value,
          createdAt: m.createdAt, updatedAt: m.updatedAt,
        })),
        tasks: tasksRef.current
          .filter((t) => t.status === "pending")
          .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status, category: t.category, createdAt: t.createdAt, updatedAt: t.updatedAt })),
        reminders: remindersRef.current
          .filter((r) => !r.completed && new Date(r.datetime).getTime() > now)
          .slice(0, 10)
          .map((r) => ({ id: r.id, title: r.title, content: r.content, datetime: r.datetime })),
        notes: notesRef.current.slice(0, 10).map((n) => ({
          id: n.id, content: n.content, title: n.title, category: n.category, timestamp: n.timestamp,
        })),
        preferences: preferencesRef.current
          ? { name: preferencesRef.current.name, location: preferencesRef.current.location, timezone: preferencesRef.current.timezone, responseLength: preferencesRef.current.responseLength }
          : undefined,
      };

      // Ensure WebSocket is open; reconnect if necessary
      if (!wsRef.current || wsRef.current.readyState !== 1) {
        connectWs();
        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 5_000;
          const check = setInterval(() => {
            if (wsReadyRef.current && wsRef.current?.readyState === 1) {
              clearInterval(check); resolve();
            } else if (Date.now() > deadline) {
              clearInterval(check); reject(new Error("WebSocket not available"));
            }
          }, 100);
        });
      }

      if (!wsReadyRef.current || !wsRef.current || wsRef.current.readyState !== 1) {
        throw new Error("WebSocket not available — please try again.");
      }

      // Set a hard timeout for the entire response
      clearResponseTimer();
      responseTimerRef.current = setTimeout(() => {
        showError("Response timed out. Please try again.");
      }, RESPONSE_TIMEOUT_MS);

      wsRef.current.send(JSON.stringify(payload));

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[Realtime] stopAndProcess error:", err);

      // If the WS path failed, activate fallback for future calls
      if (msg.toLowerCase().includes("websocket")) {
        useFallbackRef.current = true;
      }

      showError(msg);
    }
  }, [connectWs, fallback]);

  useEffect(() => { stopAndProcessRef.current = stopAndProcess; }, [stopAndProcess]);

  // ── Stop speaking mid-response ─────────────────────────────────────────────

  const stopSpeaking = useCallback(async () => {
    clearResponseTimer();
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      soundRef.current = null;
    }
    // Tell the server to cancel the current response
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    inflightRef.current = false;
    setStateSync("idle");
  }, []);

  // ── Toggle (primary UI entrypoint) ────────────────────────────────────────

  const toggle = useCallback(() => {
    if (useFallbackRef.current) {
      fallback.toggle();
      return;
    }
    const s = stateRef.current;
    if (s === "idle" || s === "error") startRecording();
    else if (s === "listening") stopAndProcess();
    else if (s === "speaking")  stopSpeaking();
  }, [startRecording, stopAndProcess, stopSpeaking, fallback]);

  // ── If using fallback, mirror fallback state ───────────────────────────────

  if (useFallbackRef.current) {
    return {
      state: fallback.state,
      mode:  fallback.mode,
      setMode: fallback.setMode,
      transcript: fallback.transcript,
      reply: fallback.reply,
      errorMessage: fallback.errorMessage,
      toggle: fallback.toggle,
      isIdle:      fallback.isIdle,
      isListening: fallback.isListening,
      isThinking:  fallback.isThinking,
      isSpeaking:  fallback.isSpeaking,
      isError:     fallback.isError,
    };
  }

  return {
    state,
    mode,
    setMode,
    transcript,
    reply,
    errorMessage,
    toggle,
    isIdle:      state === "idle",
    isListening: state === "listening",
    isThinking:  state === "thinking",
    isSpeaking:  state === "speaking",
    isError:     state === "error",
  };
}

// ── Web-only base64 helper ───────────────────────────────────────────────────

async function readBlobAsBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
