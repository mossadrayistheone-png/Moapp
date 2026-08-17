/**
 * useRealtimeVoice
 *
 * Replaces the classic Whisper → GPT → ElevenLabs HTTP pipeline with a single
 * persistent WebSocket connection to the backend, which in turn uses the
 * OpenAI Realtime API (gpt-4o-realtime-preview).
 *
 * If the WebSocket path fails (network error, server restart, etc.) the hook
 * falls back transparently to the classic HTTP pipeline via useVoice.
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

const WS_CONNECT_TIMEOUT_MS = 6_000;
// 28 s covers the worst case: fresh OpenAI WS handshake (~8 s) + ffmpeg
// conversion (~2 s) + model response generation (~5 s) + mobile network jitter.
const RESPONSE_TIMEOUT_MS   = 28_000;
// Maximum time allowed for audio playback before forcing idle.
const AUDIO_PLAYBACK_MAX_MS = 90_000;

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

  // ── Core state ────────────────────────────────────────────────────────────

  const [state, setState]               = useState<AssistantState>("idle");
  const [mode, setMode]                 = useState<AssistantMode>("executive");
  const [transcript, setTranscript]     = useState("");
  const [reply, setReply]               = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const stateRef      = useRef<AssistantState>("idle");
  // Refs so playAudioFromBase64's closure always reads the latest values,
  // avoiding the stale-closure bug where onTurnComplete fires with "".
  const transcriptRef = useRef("");
  const replyRef      = useRef("");

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const wsRef          = useRef<WebSocket | null>(null);
  const wsReadyRef     = useRef(false);
  // useFallbackRef: permanently switches to HTTP pipeline when true.
  // Also stored as state so any code path that sets it triggers a re-render.
  const useFallbackRef = useRef(false);
  const [useFallback, setUseFallback] = useState(false);

  // ── Recording / inflight ─────────────────────────────────────────────────

  const recordingRef        = useRef<Audio.Recording | null>(null);
  const soundRef            = useRef<Audio.Sound | null>(null);
  const inflightRef         = useRef(false);
  const silenceIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAndProcessRef   = useRef<(() => void) | null>(null);

  // ── Timers ────────────────────────────────────────────────────────────────

  // Fired when the server takes too long to send any response.
  const responseTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fired when audio has been playing for too long (prevents stuck "speaking").
  const audioPlaybackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Turn tracking ─────────────────────────────────────────────────────────

  // Set to true the moment an "audio" message arrives. Allows the "done"
  // handler to distinguish "audio already received and being played" from
  // "no audio in this turn" without relying on async state transitions.
  const audioStartedRef = useRef(false);

  // ── Mode + stable option refs ─────────────────────────────────────────────

  const modeRef         = useRef<AssistantMode>("executive");
  const callbacksRef    = useRef(callbacks);
  const memoriesRef     = useRef(memories);
  const tasksRef        = useRef(tasks);
  const remindersRef    = useRef(reminders);
  const notesRef        = useRef(notes);
  const preferencesRef  = useRef(preferences);
  const conversationRef = useRef(conversationHistory);
  const autoplayRef     = useRef(autoplay);

  useEffect(() => { modeRef.current         = mode;                }, [mode]);
  useEffect(() => { callbacksRef.current    = callbacks;            }, [callbacks]);
  useEffect(() => { memoriesRef.current     = memories;             }, [memories]);
  useEffect(() => { tasksRef.current        = tasks;                }, [tasks]);
  useEffect(() => { remindersRef.current    = reminders;            }, [reminders]);
  useEffect(() => { notesRef.current        = notes;                }, [notes]);
  useEffect(() => { preferencesRef.current  = preferences;          }, [preferences]);
  useEffect(() => { conversationRef.current = conversationHistory;  }, [conversationHistory]);
  useEffect(() => { autoplayRef.current     = autoplay;             }, [autoplay]);

  // ── Fallback (HTTP pipeline) ───────────────────────────────────────────────
  // Created unconditionally (Rules of Hooks). Only surfaced to the UI when
  // useFallbackRef is true.

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

  // ── Timer helpers ─────────────────────────────────────────────────────────

  const clearResponseTimer = () => {
    if (responseTimerRef.current !== null) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  };

  const clearAudioPlaybackTimer = () => {
    if (audioPlaybackTimerRef.current !== null) {
      clearTimeout(audioPlaybackTimerRef.current);
      audioPlaybackTimerRef.current = null;
    }
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

  // ── State helpers ─────────────────────────────────────────────────────────

  const setStateSync = (s: AssistantState) => {
    stateRef.current = s;
    setState(s);
  };

  // Full reset of all in-flight tracking. Called on every error or completion.
  const resetTurnTracking = () => {
    clearResponseTimer();
    clearAudioPlaybackTimer();
    audioStartedRef.current = false;
    inflightRef.current     = false;
  };

  const showError = (msg: string) => {
    resetTurnTracking();
    setErrorMessage(msg);
    setStateSync("error");
    setTimeout(() => {
      if (stateRef.current === "error") setStateSync("idle");
    }, 4_000);
  };

  // Permanently switch to the HTTP pipeline and trigger a re-render.
  const activateFallback = (reason = "Switching to classic pipeline.") => {
    console.warn("[Realtime]", reason);
    useFallbackRef.current = true;
    setUseFallback(true);
    resetTurnTracking();
    setStateSync("idle");
  };

  // ── WebSocket setup ───────────────────────────────────────────────────────

  const connectWs = useCallback(() => {
    if (!DOMAIN || useFallbackRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      connectTimer = setTimeout(() => {
        if (ws.readyState !== 1) {
          activateFallback("WS connect timeout — switching to classic pipeline.");
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

          case "user_transcript": {
            const userText = (msg.text as string | undefined) ?? "";
            transcriptRef.current = userText;
            setTranscript(userText);
            break;
          }

          case "reply": {
            const replyText = (msg.text as string | undefined) ?? "";
            replyRef.current = replyText;
            setReply(replyText);
            break;
          }

          case "audio": {
            // Mark that audio was received for this turn BEFORE starting async
            // playback. The "done" handler checks this flag to decide whether
            // to go idle (no audio) or wait (audio already queued).
            audioStartedRef.current = true;
            clearResponseTimer();

            const audioData = msg.data as string | undefined;
            if (!autoplayRef.current || !audioData) {
              // Autoplay off — still need to exit thinking state.
              audioStartedRef.current = false;
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

          case "done": {
            // ALWAYS clear the response timer — prevents spurious errors on
            // tool-only turns (no audio) 12 s after successful completion.
            clearResponseTimer();

            if (audioStartedRef.current) {
              // Audio has already been queued for playback. Let the
              // playback lifecycle (didJustFinish / error) manage state.
              // Reset the flag so it doesn't bleed into the next turn.
              audioStartedRef.current = false;
            } else {
              // No audio in this turn (e.g. pure tool call). Go idle now.
              setStateSync("idle");
              inflightRef.current = false;
            }
            break;
          }

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
        // If we were mid-request, abort it cleanly rather than waiting 12 s.
        if (inflightRef.current) {
          showError("Connection lost. Please try again.");
        }
        wsReadyRef.current = false;
        // Don't immediately switch to fallback on a transient error — allow
        // the close handler to retry. Fallback is activated only on connect
        // timeout (above) or explicit WS construction failure (below).
      };

      ws.onclose = () => {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
        wsReadyRef.current = false;
        wsRef.current = null;

        // If the socket closed while we were waiting for a response, abort
        // the in-flight request so the UI doesn't hang.
        if (inflightRef.current) {
          showError("Connection closed. Please try again.");
        }
      };
    } catch {
      activateFallback("WS construction failed — switching to classic pipeline.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWs]);

  // ── Tool result side-effects ──────────────────────────────────────────────

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

  // ── Audio playback ────────────────────────────────────────────────────────

  const playAudioFromBase64 = async (base64: string, mimeType: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      let audioUri: string;
      if (Platform.OS === "web") {
        audioUri = `data:${mimeType};base64,${base64}`;
      } else {
        const ext  = mimeType.includes("wav") ? "wav" : "mp3";
        const path = `${FileSystem.cacheDirectory}mo-rt-${Date.now()}.${ext}`;
        await FileSystem.writeAsStringAsync(path, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        audioUri = path;
      }

      if (Platform.OS !== "web") {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      }

      const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: false });
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if ("didJustFinish" in status && status.didJustFinish) {
          clearAudioPlaybackTimer();
          setStateSync("idle");
          inflightRef.current = false;
          sound.unloadAsync().catch(() => {});
          callbacksRef.current?.onTurnComplete?.(transcriptRef.current, replyRef.current);
        }
      });

      // Guard: if sound never fires didJustFinish (corrupt audio, decoder bug),
      // force-reset state after AUDIO_PLAYBACK_MAX_MS.
      clearAudioPlaybackTimer();
      audioPlaybackTimerRef.current = setTimeout(() => {
        console.warn("[Realtime] Audio playback timeout — forcing idle.");
        setStateSync("idle");
        inflightRef.current = false;
        sound.unloadAsync().catch(() => {});
      }, AUDIO_PLAYBACK_MAX_MS);

      setStateSync("speaking");
      await sound.playAsync();
    } catch (err) {
      console.error("[Realtime] Audio playback failed:", err);
      clearAudioPlaybackTimer();
      audioStartedRef.current = false;
      inflightRef.current = false;
      setStateSync("idle");
    }
  };

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (useFallbackRef.current) { fallback.toggle(); return; }

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setErrorMessage("Microphone permission denied.");
        setStateSync("error");
        setTimeout(() => { if (stateRef.current === "error") setStateSync("idle"); }, 3_000);
        return;
      }

      if (Platform.OS !== "web") {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;

      transcriptRef.current = "";
      replyRef.current      = "";
      setTranscript("");
      setReply("");
      setStateSync("listening");

      if (Platform.OS !== "web") {
        let speechDetected   = false;
        let silenceFrameCount = 0;
        let peakDb           = -160;

        silenceIntervalRef.current = setInterval(async () => {
          if (stateRef.current !== "listening") { clearRecordingTimers(); return; }
          try {
            const status = await recording.getStatusAsync() as unknown as Record<string, number>;
            const db: number = status.metering ?? -160;

            if (!speechDetected) {
              if (db > SPEECH_THRESHOLD_DB) {
                speechDetected    = true;
                peakDb            = db;
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
          } catch { /* metering read failed — ignore */ }
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
      setTimeout(() => { if (stateRef.current === "error") setStateSync("idle"); }, 3_000);
    }
  }, [fallback]);

  // ── Process audio after recording stops ───────────────────────────────────

  const stopAndProcess = useCallback(async () => {
    clearRecordingTimers();

    const recording = recordingRef.current;
    if (!recording) return;
    if (inflightRef.current) return;

    inflightRef.current = true;
    // Reset turn tracking state for a fresh turn.
    audioStartedRef.current = false;
    clearResponseTimer();
    clearAudioPlaybackTimer();

    setStateSync("thinking");

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        setStateSync("idle");
        inflightRef.current = false;
        return;
      }

      if (useFallbackRef.current) {
        // WS already failed before this recording started — hand off to HTTP.
        inflightRef.current = false;
        setStateSync("idle");
        fallback.toggle();
        return;
      }

      const [audioBase64] = await Promise.all([
        Platform.OS === "web"
          ? readBlobAsBase64(uri)
          : FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
        Platform.OS !== "web"
          ? Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })
          : Promise.resolve(),
      ]);

      const audioFormat = Platform.OS === "web" ? "webm" : "m4a";

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

      // Ensure socket is open; attempt reconnect if needed.
      if (!wsRef.current || wsRef.current.readyState !== 1) {
        connectWs();
        await new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 5_000;
          const check = setInterval(() => {
            if (wsReadyRef.current && wsRef.current?.readyState === 1) {
              clearInterval(check); resolve();
            } else if (Date.now() > deadline) {
              clearInterval(check); reject(new Error("WebSocket unavailable"));
            }
          }, 100);
        });
      }

      if (!wsReadyRef.current || !wsRef.current || wsRef.current.readyState !== 1) {
        throw new Error("WebSocket unavailable — please try again.");
      }

      // Hard deadline for the full server round-trip.
      responseTimerRef.current = setTimeout(() => {
        showError("Response timed out. Please try again.");
      }, RESPONSE_TIMEOUT_MS);

      wsRef.current.send(JSON.stringify(payload));

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[Realtime] stopAndProcess error:", err);
      if (msg.toLowerCase().includes("websocket") || msg.toLowerCase().includes("unavailable")) {
        // Signal the server path as unreliable — next tap uses HTTP pipeline.
        useFallbackRef.current = true;
        setUseFallback(true);
      }
      showError(msg);
    }
  }, [connectWs, fallback]);

  useEffect(() => { stopAndProcessRef.current = stopAndProcess; }, [stopAndProcess]);

  // ── Stop speaking ─────────────────────────────────────────────────────────

  const stopSpeaking = useCallback(async () => {
    clearAudioPlaybackTimer();
    clearResponseTimer();
    audioStartedRef.current = false;

    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    inflightRef.current = false;
    setStateSync("idle");
  }, []);

  // ── Toggle — the single entry point for the mic button ───────────────────

  const toggle = useCallback(() => {
    if (useFallbackRef.current) { fallback.toggle(); return; }

    const s = stateRef.current;
    if (s === "idle" || s === "error") {
      startRecording();
    } else if (s === "listening") {
      stopAndProcess();
    } else if (s === "thinking") {
      // Allow the user to cancel a stuck or slow request.
      clearResponseTimer();
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: "interrupt" }));
      }
      inflightRef.current = false;
      audioStartedRef.current = false;
      setStateSync("idle");
    } else if (s === "speaking") {
      stopSpeaking();
    }
  }, [startRecording, stopAndProcess, stopSpeaking, fallback]);

  // ── If using fallback, mirror its state ───────────────────────────────────

  if (useFallback || useFallbackRef.current) {
    return {
      state:        fallback.state,
      mode:         fallback.mode,
      setMode:      fallback.setMode,
      transcript:   fallback.transcript,
      reply:        fallback.reply,
      errorMessage: fallback.errorMessage,
      toggle:       fallback.toggle,
      isIdle:       fallback.isIdle,
      isListening:  fallback.isListening,
      isThinking:   fallback.isThinking,
      isSpeaking:   fallback.isSpeaking,
      isError:      fallback.isError,
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

// ── Web-only helpers ──────────────────────────────────────────────────────────

async function readBlobAsBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob     = await response.blob();
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
