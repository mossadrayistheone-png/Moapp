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

// ── Filler phrase assets ──────────────────────────────────────────────────────
// Pre-generated MP3s recorded in Mo's voice via the STS pipeline.
// Played immediately after the user stops speaking so the ~7 s processing gap
// is not silent. Assets must be listed with static require() for Metro bundling.

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

// ── Silence detection thresholds ─────────────────────────────────────────────

// Metering values are in dBFS (0 = full scale, −160 = silence)
const SPEECH_THRESHOLD_DB  = -35;  // above this = user is speaking
const SILENCE_THRESHOLD_DB = -42;  // absolute quiet floor
const PEAK_DROP_DB         = 14;   // drop from speech peak → counts as silence
                                   //   works even in loud/noisy environments
const SILENCE_FRAMES       = 3;    // 3 × 200 ms = 0.6 s of sustained silence
const MAX_SPEECH_MS        = 8_000; // stop 8 s after first speech (noisy env fallback)
const MAX_RECORD_MS        = 30_000; // hard cap if user never speaks

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

  const recordingRef    = useRef<Audio.Recording | null>(null);
  const soundRef        = useRef<Audio.Sound | null>(null);      // real answer audio
  const fillerSoundRef  = useRef<Audio.Sound | null>(null);      // filler audio
  const stateRef        = useRef<AssistantState>("idle");

  // Inflight guard — prevents duplicate requests if user taps while a request
  // is already in progress (e.g., after a 502 that left the app in an odd state)
  const inflightRef = useRef(false);

  // Silence-detection timers
  const silenceIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
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
        let peakDb = -160; // tracks the loudest frame since speech started

        silenceIntervalRef.current = setInterval(async () => {
          if (stateRef.current !== "listening") {
            clearRecordingTimers();
            return;
          }
          try {
            const status = await recording.getStatusAsync();
            const db: number = (status as any).metering ?? -160;

            if (!speechDetected) {
              // Wait for the user to start talking
              if (db > SPEECH_THRESHOLD_DB) {
                speechDetected = true;
                peakDb = db;
                silenceFrameCount = 0;

                // Max-speech timer: stop at most 8 s after first speech.
                // This is the key fallback for noisy environments where the
                // absolute silence threshold is never crossed.
                setTimeout(() => {
                  if (stateRef.current === "listening") {
                    clearRecordingTimers();
                    stopAndProcessRef.current?.();
                  }
                }, MAX_SPEECH_MS);
              }
            } else {
              // Update running peak while still speaking
              if (db > peakDb) peakDb = db;

              // Two ways to detect silence:
              //  1. Absolute: level below the quiet floor
              //  2. Relative: level dropped ≥ PEAK_DROP_DB from the speech peak
              //     → works in noisy environments (music, traffic, etc.)
              const isSilent =
                db < SILENCE_THRESHOLD_DB || peakDb - db >= PEAK_DROP_DB;

              if (isSilent) {
                silenceFrameCount++;
                if (silenceFrameCount >= SILENCE_FRAMES) {
                  clearRecordingTimers();
                  stopAndProcessRef.current?.();
                }
              } else {
                silenceFrameCount = 0; // still talking — reset counter
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

  // ── Filler playback ─────────────────────────────────────────────────────────
  // Picks a random pre-generated filler phrase and plays it in Mo's voice.
  // Returns a Promise that resolves when the filler finishes — or immediately
  // if it cannot be loaded — so it can be raced/combined with the API call.
  //
  // Transition contract:
  //   • Sets state → "speaking" as soon as audio starts.
  //   • Resolves the Promise when the audio finishes (or fails).
  //   • The caller (stopAndProcess) uses Promise.all([fillerPromise, apiPromise])
  //     so the real answer ONLY plays after BOTH the filler finishes AND the
  //     API response is ready — guaranteeing zero overlap, zero race conditions.
  //
  const playFillerAsync = useCallback((): Promise<void> => {
    const idx = Math.floor(Math.random() * FILLER_ASSETS.length);

    return new Promise<void>((resolve) => {
      Audio.Sound.createAsync(FILLER_ASSETS[idx], { shouldPlay: false })
        .then(({ sound }) => {
          fillerSoundRef.current = sound;

          sound.setOnPlaybackStatusUpdate((status) => {
            if ("didJustFinish" in status && status.didJustFinish) {
              fillerSoundRef.current = null;
              sound.unloadAsync().catch(() => {});
              resolve();
            }
          });

          setStateSync("speaking");
          return sound.playAsync();
        })
        .catch(() => {
          // Filler failed to load or play — resolve immediately so the real
          // answer is never blocked by a filler audio error.
          fillerSoundRef.current = null;
          resolve();
        });
    });
  }, []);

  const stopAndProcess = useCallback(async () => {
    // Cancel any running silence / max-duration timers
    clearRecordingTimers();

    const recording = recordingRef.current;
    if (!recording) return;

    // Inflight guard — if a request is already in progress, don't fire another.
    // This prevents duplicate sends from rapid taps or timing edge cases.
    if (inflightRef.current) return;

    // Hoisted so the catch block can check signal.aborted (React Native / Hermes
    // throws "Network request failed" instead of "AbortError" when AbortController
    // aborts a fetch — checking signal.aborted lets us correctly classify timeouts).
    let fetchController: AbortController | null = null;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        setStateSync("idle");
        return;
      }

      // Show "Thinking..." immediately — don't wait for audio mode switch
      setStateSync("thinking");
      inflightRef.current = true;

      // Unload any previously playing audio (filler or answer from a prior turn)
      if (fillerSoundRef.current) {
        await fillerSoundRef.current.stopAsync().catch(() => {});
        await fillerSoundRef.current.unloadAsync().catch(() => {});
        fillerSoundRef.current = null;
      }
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Switch audio mode and read file in parallel — saves ~100 ms.
      // Audio mode must switch to playback BEFORE any sound is played (filler
      // or answer), which is why this step must complete before playFillerAsync.
      const [audioBase64] = await Promise.all([
        Platform.OS === "web"
          ? readBlobAsBase64(uri)
          : FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            }),
        Platform.OS !== "web"
          ? Audio.setAudioModeAsync({
              allowsRecordingIOS: false,
              playsInSilentModeIOS: true,
            })
          : Promise.resolve(),
      ]);

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

      fetchController = new AbortController();
      const fetchTimeoutId = setTimeout(() => fetchController!.abort(), 28_000);

      // ── API fetch (runs as a Promise — does NOT block filler playback) ────
      // Immediately starts the network request. Returns the audio URI (string)
      // when ready, or null if the server returned text-only (STS failed).
      // Side effects (tool callbacks, transcript, reply) are fired here too,
      // so the UI updates as soon as the API responds regardless of filler state.
      const apiPromise: Promise<string | null> = fetch(`${BASE_URL}/api/mo/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: fetchController.signal,
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
      })
        .finally(() => clearTimeout(fetchTimeoutId))
        .then(async (response) => {
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

          if (!tx?.trim() || !rp) return null;

          setTranscript(tx);
          setReply(rp);

          // Fire side effects while filler is still playing
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

          // Write real answer audio to a file while filler is still potentially
          // playing. By the time the filler finishes, the URI is already ready.
          let audioUri: string;
          if (Platform.OS === "web") {
            audioUri = `data:audio/mpeg;base64,${audiob64}`;
          } else {
            const audioPath = `${FileSystem.cacheDirectory}mo-reply-${Date.now()}.mp3`;
            await FileSystem.writeAsStringAsync(audioPath, audiob64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            audioUri = audioPath;
          }
          return audioUri;
        });

      // ── Concurrent execution ────────────────────────────────────────────────
      // Promise.all guarantees:
      //   • Filler plays completely — real answer NEVER starts during the filler.
      //   • API response is fully ready before audio starts — no buffering wait.
      //   • If filler ends before API returns: silence while waiting (state stays
      //     "speaking"), then answer plays the moment it's ready — no flicker.
      //   • If API returns before filler ends: URI is ready, waits for filler,
      //     then answer plays immediately — no gap at the transition.
      const [, answerUri] = await Promise.all([
        playFillerAsync(),
        apiPromise,
      ]);

      // Abort if user stopped manually while we were waiting
      if (!inflightRef.current) return;

      if (!answerUri) {
        // STS failed or empty transcript — filler played, now return to idle
        setStateSync("idle");
        inflightRef.current = false;
        return;
      }

      // ── Play the real answer ────────────────────────────────────────────────
      // Filler is guaranteed finished. No overlap possible.
      const { sound } = await Audio.Sound.createAsync(
        { uri: answerUri },
        { shouldPlay: false }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if ("didJustFinish" in status && status.didJustFinish) {
          setStateSync("idle");
          inflightRef.current = false;
          sound.unloadAsync();
        }
      });

      setStateSync("speaking");
      await sound.playAsync();

    } catch (err: any) {
      inflightRef.current = false;
      // React Native / Hermes throws "Network request failed" (not "AbortError")
      // when AbortController.abort() cancels a pending fetch. Fall back to
      // checking signal.aborted so we still surface the correct timeout message.
      const isTimeout =
        err?.name === "AbortError" ||
        err?.name === "TimeoutError" ||
        fetchController?.signal.aborted === true;
      const msg = isTimeout
        ? "Request timed out. Please try again."
        : (err?.message ?? "Something went wrong. Please try again.");
      console.error("Voice pipeline error:", err);
      setErrorMessage(msg);
      setStateSync("error");
      setTimeout(() => setStateSync("idle"), 4000);
    }
  }, [mode, conversationHistory, memories, tasks, reminders, notes, preferences, autoplay, callbacks, playFillerAsync]);

  // Keep the ref current so startRecording's interval always calls the
  // latest version of stopAndProcess (avoids stale-closure issues).
  useEffect(() => {
    stopAndProcessRef.current = stopAndProcess;
  }, [stopAndProcess]);

  const stopSpeaking = useCallback(async () => {
    // Stop filler if it's still playing
    if (fillerSoundRef.current) {
      await fillerSoundRef.current.stopAsync().catch(() => {});
      await fillerSoundRef.current.unloadAsync().catch(() => {});
      fillerSoundRef.current = null;
    }
    // Stop real answer if it's playing
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      soundRef.current = null;
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
