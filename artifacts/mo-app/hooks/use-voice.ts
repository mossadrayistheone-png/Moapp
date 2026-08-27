import { Audio } from "expo-av";                    // filler playback only (bundled assets)
import {
  useAudioRecorder,
  useAudioRecorderState,
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

// ── Internal pipeline state machine ──────────────────────────────────────────
// The UI only ever sees the 5 AssistantState values above (no visual changes).
// Internally we track a more granular, explicitly-named pipeline phase for
// tracing/debugging: idle → listening → transcribing → thinking →
// generating_voice → speaking → idle. Because Mo's server does Whisper → GPT →
// ElevenLabs as ONE round trip (to minimise voice latency), the client cannot
// observe transcribing/thinking/generating_voice as independently-timed live
// states without a streaming response — and faking live progress with guessed
// timings would violate "no mocked data". Instead: transcribing/thinking/
// generating_voice are logged in order the instant the response lands, each
// annotated with its REAL server-measured duration (from `timings` in the
// response), giving a fully honest, traceable record of where time went and
// where a failure occurred — without any fake intermediate UI state.
export type PipelinePhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "generating_voice"
  | "speaking"
  | "error";

const VALID_PHASE_TRANSITIONS: Record<PipelinePhase, PipelinePhase[]> = {
  idle:             ["listening"],
  listening:        ["transcribing", "idle", "error"],
  transcribing:     ["thinking", "idle", "error"],
  thinking:         ["generating_voice", "idle", "error"],
  generating_voice: ["speaking", "idle", "error"],
  speaking:         ["idle", "error"],
  error:            ["idle", "listening"],
};

export type AssistantMode = "executive" | "daily" | "luxury";
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
// Both Android and iOS record ADTS AAC (.aac): ADTS is a raw frame stream
// that is decodable mid-write, which lets us read the partial file while
// recording and transcribe it for the live rolling transcript.
// (MP4/M4A writes its moov index at stop — partial files are unreadable.)
// On iOS, using extension ".aac" causes AVAudioRecorder to write an ADTS
// container instead of MP4, making partial reads possible just like Android.
const RECORDING_OPTIONS: EARecordingOptions = {
  extension: ".aac",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,   // required for VAD silence detection
  android: {
    outputFormat: "aac_adts",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
  },
  web: {},
};

// Fixed recording duration (max cap). record({ forDuration }) tells the native
// recorder to stop automatically after N seconds. The statusListener (isFinished)
// fires and triggers stopAndProcess() if VAD never detected silence.
const RECORD_DURATION_S = 4;

// VAD (Voice Activity Detection) constants.
// Metering values are in dBFS (0 = full scale, negative = quieter).
// Both speech-start and trailing-silence thresholds are derived each session
// from an ambient calibration window so they are always self-consistent:
//   sessionSilenceThreshold = clamp(ambientFloor + SILENCE_OFFSET, MIN, MAX)
//   sessionSpeechThreshold  = sessionSilenceThreshold + SPEECH_HYSTERESIS
// The hysteresis gap guarantees a level recognised as speech is never
// simultaneously counted as silence, regardless of environment.
const VAD_SILENCE_DURATION_MS      = 600;   // ms of continuous silence → stop
const VAD_POLL_INTERVAL_MS         = 100;   // ms between metering polls

// Adaptive ambient-noise calibration.
const VAD_AMBIENT_SAMPLE_MS        = 300;   // ms of pre-speech ambient sampling
const VAD_AMBIENT_POLL_MS          = 50;    // ms between ambient metering reads
const VAD_AMBIENT_SILENCE_OFFSET   = 8;    // dBFS above ambient floor → silence threshold
const VAD_SPEECH_HYSTERESIS        = 8;    // dBFS above silence threshold → speech threshold
const VAD_SILENCE_THRESHOLD_MIN    = -50;  // quietest silence threshold (very quiet room)
const VAD_SILENCE_THRESHOLD_MAX    = -22;  // loudest silence threshold (very noisy env)
// Derived speech-threshold bounds follow automatically:
//   speechMin = VAD_SILENCE_THRESHOLD_MIN + VAD_SPEECH_HYSTERESIS = -42
//   speechMax = VAD_SILENCE_THRESHOLD_MAX + VAD_SPEECH_HYSTERESIS = -14

// Static fallbacks used when calibration yields no samples (first boot, web, etc.)
const VAD_SILENCE_THRESHOLD_DB     = -35;  // dBFS — quiet-room default
const VAD_SPEECH_THRESHOLD_DB      = VAD_SILENCE_THRESHOLD_DB + VAD_SPEECH_HYSTERESIS; // -27 dBFS

// Live transcript polling — while listening, the partial recording is uploaded
// every LIVE_POLL_INTERVAL_MS for a best-effort rolling transcript. Works on
// iOS and Android (both record ADTS AAC, which is decodable mid-write).
// Web blob URIs are not readable mid-recording, so polling is skipped there.
const LIVE_POLL_INTERVAL_MS = 1200;

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
  // Rolling in-progress transcript shown while listening (iOS + Android).
  // Frozen when recording stops; replaced by the final Whisper transcript.
  const [liveTranscript, setLiveTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // Normalised mic level 0–1; updated every VAD poll tick while listening.
  // 0 = silence, 1 = maximum input. Falls back to 0 on web / when unavailable.
  const [micLevel, setMicLevel] = useState(0);

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

  // Live metering (dBFS) for VAD — the SDK-documented way to read a recorder's
  // current level is the `useAudioRecorderState` hook, NOT `recorder.getStatus()`
  // called ad hoc from a hand-rolled interval. Poll at VAD_AMBIENT_POLL_MS (the
  // finer of our two intervals) so both the ambient-calibration loop and the
  // VAD loop below always see a fresh reading. The hook's returned state is
  // mirrored into a ref so synchronous code (setInterval callbacks) can read
  // the latest value without depending on React re-renders.
  const recorderState = useAudioRecorderState(recorder, VAD_AMBIENT_POLL_MS);
  const recorderStateRef = useRef(recorderState);
  recorderStateRef.current = recorderState;   // update on every render (synchronous)

  const recordingActive = useRef(false);
  const stateRef        = useRef<AssistantState>("idle");
  const inflightRef     = useRef(false);
  const fetchAbortRef   = useRef<AbortController | null>(null);
  const stopAndProcessRef = useRef<(() => void) | null>(null);

  // Explicit pipeline phase (see PipelinePhase above) — internal tracing only,
  // never drives UI. Validated against VALID_PHASE_TRANSITIONS on every change
  // so an illegal jump (e.g. "listening" → "speaking") is loudly logged instead
  // of silently happening.
  const phaseRef = useRef<PipelinePhase>("idle");
  const transitionPhase = useCallback((next: PipelinePhase, meta?: Record<string, unknown>) => {
    const prev = phaseRef.current;
    if (prev === next) return;
    const allowed = VALID_PHASE_TRANSITIONS[prev]?.includes(next);
    if (!allowed) {
      console.warn(`[Mo][phase] INVALID transition ${prev} → ${next}`, meta ?? "");
    } else {
      console.log(`[Mo][phase] ${prev} → ${next}`, meta ?? "");
    }
    phaseRef.current = next;
  }, []);

  // Guards the window between "user tapped mic" and "recorder actually armed".
  // Without this, a fast double-tap during the async permission-request await
  // could start two concurrent recordings before stateRef flips to "listening".
  const startingRef = useRef(false);

  // VAD polling interval — cleared when recording stops or is interrupted.
  const vadIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live transcript polling — cleared when recording stops or is interrupted.
  const liveIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveInflightRef   = useRef(false);   // one partial upload at a time
  const liveSessionRef    = useRef(0);       // ignore stale responses across sessions
  const liveLastSeqRef    = useRef(0);       // ignore out-of-order responses

  const stopLivePolling = () => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    liveInflightRef.current = false;
  };

  // Filler sound (expo-av, bundled assets — works on all architectures)
  const fillerSoundRef  = useRef<Audio.Sound | null>(null);

  // Playback tracking
  const isPlayingAnswerRef   = useRef(false);
  const playbackStartedRef   = useRef(false);
  // Safety timer: if expo-audio never starts playing within 8 s, force idle
  // so the app never gets permanently stuck in "speaking" state.
  const answerSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Base64 data-URI fallback for the answer audio. Used once if the primary
  // https URL source never starts playing (see safety timeout).
  const answerFallbackRef    = useRef<string | null>(null);

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
      console.log("[Mo] Answer playback started — clearing safety timer");
      // Cancel the safety timeout — audio is playing normally
      if (answerSafetyTimerRef.current) {
        clearTimeout(answerSafetyTimerRef.current);
        answerSafetyTimerRef.current = null;
      }
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
      transitionPhase("idle", { reason: "playback_finished" });
      setAnswerSource(null);
    }
  }, [answerPlayerStatus.playing, transitionPhase]);

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
    console.log("[Mo] startRecording — state:", stateRef.current, "inflight:", inflightRef.current, "starting:", startingRef.current);

    if (startingRef.current) {
      console.warn("[Mo] startRecording — BLOCKED duplicate submission (start already in progress)");
      return;
    }
    const readyToStart: boolean = stateRef.current === "idle" || stateRef.current === "error";
    if (!readyToStart) {
      console.warn("[Mo] startRecording — BLOCKED, not idle/error. state:", stateRef.current);
      return;
    }
    startingRef.current = true;

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      console.log("[Mo] mic permission granted:", granted);
      if (!granted) {
        setErrorMessage("Microphone permission denied.");
        setStateSync("error");
        transitionPhase("error", { reason: "mic_permission_denied" });
        setTimeout(() => setStateSync("idle"), 8000);
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

      // Add the calibration window to the cap so it does not reduce usable
      // listening time (calibration samples are taken from the first
      // VAD_AMBIENT_SAMPLE_MS ms of the recording).
      const recordDurationWithCalibration = RECORD_DURATION_S + VAD_AMBIENT_SAMPLE_MS / 1000;

      if (Platform.OS === "web") {
        // Web: no native forDuration support — use a manual fallback timer
        recorder.record();
        setTimeout(() => {
          if (stateRef.current === "listening") {
            stopAndProcessRef.current?.();
          }
        }, recordDurationWithCalibration * 1000);
      } else {
        // Native: auto-stops after the extended cap; statusListener fires
        recorder.record({ forDuration: recordDurationWithCalibration });
      }

      recordingActive.current = true;
      console.log("[Mo] recording started — auto-stops in", RECORD_DURATION_S, "s");

      // Transition to listening immediately so the status-listener guard and
      // the post-calibration interruption check see the correct state.
      setTranscript("");
      setReply("");
      setErrorMessage("");
      setStateSync("listening");
      transitionPhase("listening");
      // Recording is now genuinely armed — release the start-mutex so the
      // NEXT tap (e.g. to stop early) is never blocked by it.
      startingRef.current = false;

      // ── Ambient noise calibration ─────────────────────────────────────────
      // Sample metering during the first VAD_AMBIENT_SAMPLE_MS ms of recording
      // to measure the ambient noise floor. Both the silence threshold and the
      // speech-start threshold are derived from that floor so they are always
      // self-consistent and a level recognised as speech can never be
      // simultaneously below the silence threshold.
      //
      // The user may start speaking immediately after tapping, so the calibration
      // window can contain a mix of ambient and speech samples. We use the 25th
      // percentile (P25) of the collected readings rather than the average:
      // speech input is typically 10–20 dBFS louder than ambient noise, so the
      // lower quartile reliably reflects the ambient floor even when half the
      // samples are contaminated by early speech.
      let sessionSilenceThreshold = VAD_SILENCE_THRESHOLD_DB; // quiet-room fallback
      let sessionSpeechThreshold  = VAD_SPEECH_THRESHOLD_DB;  // fallback = silence + hysteresis
      await new Promise<void>((resolve) => {
        const ambientSamples: number[] = [];
        let elapsed = 0;
        const sampleInterval = setInterval(() => {
          // Read the SDK-maintained recorder state ref (kept fresh by
          // useAudioRecorderState above) instead of calling a native method
          // synchronously here — this can never throw, it's a plain object read.
          const level: number = recorderStateRef.current.metering ?? -160;
          // Only collect plausible readings (ignore -160 sentinel / no-data)
          if (level > -160) ambientSamples.push(level);
          elapsed += VAD_AMBIENT_POLL_MS;
          if (elapsed >= VAD_AMBIENT_SAMPLE_MS) {
            clearInterval(sampleInterval);
            if (ambientSamples.length > 0) {
              // Sort ascending and pick P25 — the lower quartile excludes speech
              // spikes while still capturing the true ambient floor in noisy rooms.
              const sorted = [...ambientSamples].sort((a, b) => a - b);
              const p25Index = Math.floor(sorted.length * 0.25);
              const ambientFloor = sorted[p25Index] ?? sorted[0];
              sessionSilenceThreshold = Math.max(
                VAD_SILENCE_THRESHOLD_MIN,
                Math.min(VAD_SILENCE_THRESHOLD_MAX, ambientFloor + VAD_AMBIENT_SILENCE_OFFSET),
              );
              // Speech threshold is always SPEECH_HYSTERESIS dBFS above silence
              // threshold — guarantees no level is simultaneously "speech" and "silence".
              sessionSpeechThreshold = sessionSilenceThreshold + VAD_SPEECH_HYSTERESIS;
              console.log(
                "[Mo] VAD ambient P25:", ambientFloor.toFixed(1), "dBFS →",
                "silence:", sessionSilenceThreshold.toFixed(1), "dBFS /",
                "speech:", sessionSpeechThreshold.toFixed(1), "dBFS",
                "(samples:", ambientSamples.length, ")",
              );
            } else {
              console.log(
                "[Mo] VAD ambient calibration — no samples, using defaults:",
                "silence:", sessionSilenceThreshold, "/ speech:", sessionSpeechThreshold, "dBFS",
              );
            }
            resolve();
          }
        }, VAD_AMBIENT_POLL_MS);
      });

      // Bail out early if the recording was interrupted during calibration
      if (!recordingActive.current || stateRef.current !== "listening") return;

      // ── VAD polling ───────────────────────────────────────────────────────
      // Poll metering every VAD_POLL_INTERVAL_MS. Once speech is detected
      // (level > VAD_SPEECH_THRESHOLD_DB), start counting silence frames.
      // After VAD_SILENCE_DURATION_MS of continuous silence, trigger early stop.
      // The forDuration / setTimeout cap above acts as the outer safety net.
      let speechDetected = false;
      let silenceMs = 0;

      // Clear any stale interval from a previous recording
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }

      vadIntervalRef.current = setInterval(() => {
        if (!recordingActive.current || stateRef.current !== "listening") {
          clearInterval(vadIntervalRef.current!);
          vadIntervalRef.current = null;
          return;
        }

        // Read the SDK-maintained recorder state ref (kept fresh by
        // useAudioRecorderState above) — a plain object read, never throws.
        const level: number = recorderStateRef.current.metering ?? -160;

        // Normalise dBFS (-60…0) → 0–1 and publish for UI animation.
        // Floor at -60 dBFS (practical silence on mobile mics).
        const normalised = Math.max(0, Math.min(1, (level + 60) / 60));
        setMicLevel(normalised);

        if (!speechDetected) {
          if (level > sessionSpeechThreshold) {
            speechDetected = true;
            silenceMs = 0;
            console.log("[Mo] VAD — speech detected, level:", level.toFixed(1), "dBFS (threshold:", sessionSpeechThreshold.toFixed(1), ")");
          }
          // Haven't heard speech yet — reset silence counter and wait
          return;
        }

        // Speech was detected: track silence duration.
        // sessionSilenceThreshold < sessionSpeechThreshold (guaranteed by calibration),
        // so a level above the silence threshold always re-sets the counter correctly.
        if (level < sessionSilenceThreshold) {
          silenceMs += VAD_POLL_INTERVAL_MS;
          if (silenceMs >= VAD_SILENCE_DURATION_MS) {
            console.log("[Mo] VAD — silence for", silenceMs, "ms — triggering early stop");
            clearInterval(vadIntervalRef.current!);
            vadIntervalRef.current = null;
            stopAndProcessRef.current?.();
          }
        } else {
          // Sound again — reset the silence counter
          silenceMs = 0;
        }
      }, VAD_POLL_INTERVAL_MS);

      // ── Live transcript polling (iOS + Android) ───────────────────────────
      // Both platforms record ADTS AAC (.aac), which is decodable mid-write.
      // Read the partial file every tick and post to /mo/transcribe-live.
      // Best-effort: any failure is swallowed and the UI keeps whatever it
      // last showed. Web uses blob URIs that aren't mid-write readable, so
      // live polling is skipped there.
      stopLivePolling();
      setLiveTranscript("");
      liveSessionRef.current += 1;
      liveLastSeqRef.current = 0;
      const liveSession = liveSessionRef.current;
      let liveSeq = 0;

      if (Platform.OS !== "web") {
        liveIntervalRef.current = setInterval(async () => {
          if (!recordingActive.current || stateRef.current !== "listening") {
            stopLivePolling();
            return;
          }
          if (liveInflightRef.current) return;   // previous upload still running
          const uri = recorder.uri;
          if (!uri) return;

          liveInflightRef.current = true;
          const seq = ++liveSeq;
          try {
            const partialBase64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const resp = await fetch(`${BASE_URL}/api/mo/transcribe-live`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: partialBase64, format: "aac" }),
            });
            if (!resp.ok) return;
            const data: { text?: string } = await resp.json();
            const text = data.text?.trim() ?? "";
            // Only apply if this session is still current and the response
            // is newer than anything already shown (uploads can race).
            if (
              text &&
              liveSessionRef.current === liveSession &&
              seq > liveLastSeqRef.current &&
              (stateRef.current === "listening" || stateRef.current === "thinking")
            ) {
              liveLastSeqRef.current = seq;
              setLiveTranscript(text);
            }
          } catch {
            // Best-effort — ignore read/network errors, UI falls back gracefully
          } finally {
            liveInflightRef.current = false;
          }
        }, LIVE_POLL_INTERVAL_MS);
      }

    } catch (err) {
      console.error("[Mo] startRecording FAILED:", err);
      setErrorMessage("Could not start recording.");
      setStateSync("error");
      transitionPhase("error", { reason: "start_recording_failed", err: String(err) });
      setTimeout(() => setStateSync("idle"), 8000);
    } finally {
      // Always release the mutex, even on an early return or thrown error,
      // so a genuinely failed start never permanently blocks the next tap.
      startingRef.current = false;
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

    // Stop VAD polling immediately so it can't re-trigger
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    // Freeze the live transcript — no more partial uploads; the last shown
    // text stays visible until the final Whisper transcript replaces it.
    stopLivePolling();

    if (!recordingActive.current) {
      console.log("[Mo] stopAndProcess — no active recording, returning");
      return;
    }
    if (inflightRef.current) {
      console.warn("[Mo] stopAndProcess — BLOCKED duplicate submission (a request is already in flight)");
      return;
    }

    // Claim this turn SYNCHRONOUSLY, before the first await below. VAD silence
    // detection, the natural forDuration finish, and a manual button tap can
    // all call stopAndProcess() within the same tick. Without this, two calls
    // both read recordingActive/inflightRef as false (they're only flipped to
    // true after `await recorder.stop()` resolves), both slip past the guards
    // above, and both play their own random filler clip — the two overlapping
    // "transitional phrases" the user hears. Setting both refs here, before
    // any `await`, makes the guard check-and-set atomic so only the first
    // caller ever proceeds.
    recordingActive.current = false;
    inflightRef.current = true;

    let fetchController: AbortController | null = null;

    try {
      // recorder.stop() may throw if the recorder already finished naturally
      // (forDuration expired before VAD triggered). Swallow that error — the
      // URI is still valid and the pipeline should continue normally.
      try {
        await recorder.stop();
      } catch (stopErr) {
        console.warn("[Mo] recorder.stop() threw (likely already stopped by forDuration):", stopErr);
      }
      const uri = recorder.uri;
      console.log("[Mo] recorder.stop() done — uri:", uri);

      if (!uri) {
        console.warn("[Mo] validation failed — no audio URI after stop()");
        setErrorMessage("No audio captured. Tap to try again.");
        setStateSync("error");
        transitionPhase("error", { reason: "no_audio_uri" });
        setTimeout(() => setStateSync("idle"), 8_000);
        inflightRef.current = false;   // release the claim — no request was ever sent
        return;
      }

      setMicLevel(0);
      setStateSync("thinking");
      // Client-observable phase: audio captured, now uploading + awaiting the
      // server's transcribe→reply→speak pipeline. See the block below (once
      // the response lands) for the honest, server-timed replay of
      // transcribing → thinking → generating_voice.
      transitionPhase("transcribing", { uri });

      // Stop any currently playing answer
      if (answerPlayerRef.current.playing) {
        answerPlayerRef.current.pause();
      }
      setAnswerSource(null);
      answerFallbackRef.current = null;
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

      const audioFormat =
        Platform.OS === "web" ? "webm" : "aac";

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

      // Mode IDs match the server's MODE_PROMPTS keys directly.
      const apiMode = mode ?? "executive";

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
          audioUrl?: string;
          functionCalled?: string;
          reminder?: { title: string; content: string; datetime: string };
          reminderAction?: ReminderActionPayload;
          note?: NotePayload;
          noteAction?: NoteActionPayload;
          memoryAction?: MemoryActionPayload;
          taskAction?: TaskActionPayload;
          plan?: Omit<DayPlan, "generatedAt">;
          timings?: { ffmpegMs: number | null; whisperMs: number | null; gptMs: number | null; elevenTtsMs: number | null; totalMs: number };
        }) => {
          const { transcript: tx, reply: rp, audioBase64: audiob64 } = data;
          console.log("[Mo] API — transcript:", JSON.stringify(tx), "reply:", rp?.length ?? 0, "chars, hasAudio:", !!audiob64);

          // ── Honest, server-timed phase replay ─────────────────────────────
          // The single round trip already ran transcribe → reply → speak on
          // the server (see stageMs logging in mo.ts). Replay those exact,
          // real durations through the client's named phases now that we know
          // them — full traceability without faking a live progress state.
          transitionPhase("thinking", { stage: "transcribing complete", whisperMs: data.timings?.whisperMs ?? null });

          if (!tx?.trim() || !rp) {
            console.warn("[Mo] validation failed — empty transcript or reply", { transcript: tx, replyLen: rp?.length ?? 0 });
            setErrorMessage("Didn't catch that — tap to try again.");
            setStateSync("error");
            transitionPhase("error", { reason: "empty_transcript_or_reply" });
            setTimeout(() => setStateSync("idle"), 8_000);
            return null;
          }

          setErrorMessage("");
          setLiveTranscript("");   // final transcript replaces the live one
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

          transitionPhase("generating_voice", { gptMs: data.timings?.gptMs ?? null });

          if (!autoplay || !audiob64) {
            // Text-response fallback: transcript + reply are already set above
            // and remain visible on screen even though there is no audio to
            // play (autoplay off, or ElevenLabs failed server-side — see
            // "ElevenLabs TTS failed" warnings in mo.ts). This is not an
            // error — the turn completed successfully as text.
            console.warn("[Mo] No answer audio — falling back to text-only response", {
              autoplay, hasAudioBase64: !!audiob64, elevenTtsMs: data.timings?.elevenTtsMs ?? null,
            });
            return null;
          }

          // ── Answer audio source selection ─────────────────────────────────
          // Android New Architecture's MediaPlayer can silently reject local
          // file:// URIs, so we never write the answer to disk. Primary source
          // is the server's https URL (streamed); fallback is a base64 data URI
          // (already proven on web) if the URL playback never starts.
          const dataUri = `data:audio/mpeg;base64,${audiob64}`;
          let audioUri: string;
          if (Platform.OS !== "web" && data.audioUrl) {
            audioUri = `${BASE_URL}${data.audioUrl}`;
            answerFallbackRef.current = dataUri;
            console.log("[Mo] Answer audio via https URL:", audioUri);
          } else {
            audioUri = dataUri;
            answerFallbackRef.current = null;
          }
          console.log("[Mo] stage generating_voice complete", { elevenTtsMs: data.timings?.elevenTtsMs ?? null, totalMs: data.timings?.totalMs ?? null });
          return audioUri;
        });

      // Wait for BOTH filler to finish AND API to respond
      const [, answerUri] = await Promise.all([playFillerAsync(), apiPromise]);

      fetchAbortRef.current = null;

      if (!inflightRef.current) return;   // user tapped stop while we waited

      if (!answerUri) {
        // Empty transcript / error, or successful text-only fallback (no
        // audio) — both already handled/logged inside apiPromise.then().
        // Always reset inflightRef so future requests aren't blocked. State is
        // either already "error" (validation failed) or needs idle (text
        // fallback — transcript/reply stay visible on screen as-is).
        inflightRef.current = false;
        if (stateRef.current !== "error") {
          setStateSync("idle");
          transitionPhase("idle", { reason: "text_fallback_no_audio" });
        }
        return;
      }

      // ── Play the real answer via expo-audio ───────────────────────────────
      // Setting answerSource triggers useAudioPlayer to load the file.
      // Effect #3 above detects isLoaded and calls answerPlayerRef.current.play().
      // Effects #1 and #2 detect playback start and completion.
      console.log("[Mo] Starting answer playback — setting answerSource:", answerUri);
      transitionPhase("speaking", { audioUri: answerUri });
      isPlayingAnswerRef.current = true;
      playbackStartedRef.current = false;
      setAnswerSource(answerUri);

      // ── Safety timeout ────────────────────────────────────────────────────
      // If expo-audio silently fails to start (native bug or unsupported format),
      // the playback effects never fire and the app gets permanently stuck in
      // "speaking" state with inflightRef=true blocking all future requests.
      // First timeout: retry once with the base64 data-URI fallback (proven on
      // web). Second timeout: force idle — text reply is still visible.
      const armAnswerSafetyTimer = () => {
        if (answerSafetyTimerRef.current) clearTimeout(answerSafetyTimerRef.current);
        answerSafetyTimerRef.current = setTimeout(() => {
          answerSafetyTimerRef.current = null;
          if (!isPlayingAnswerRef.current || playbackStartedRef.current) return;

          const fallback = answerFallbackRef.current;
          if (fallback) {
            console.warn("[Mo] Safety timeout — https answer audio never started. Retrying with data URI fallback.");
            answerFallbackRef.current = null;   // one retry only
            setAnswerSource(fallback);
            armAnswerSafetyTimer();
            return;
          }

          console.warn("[Mo] Safety timeout — answer audio never started. Returning to idle. Text reply still visible.");
          isPlayingAnswerRef.current = false;
          inflightRef.current = false;
          setStateSync("idle");
          transitionPhase("idle", { reason: "playback_safety_timeout_text_fallback" });
          setAnswerSource(null);
        }, 8_000);
      };
      armAnswerSafetyTimer();

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
      transitionPhase("error", { reason: isTimeout ? "timeout" : "pipeline_exception", message: msg });
      setTimeout(() => setStateSync("idle"), 8000);
    }
  }, [mode, conversationHistory, memories, tasks, reminders, notes, preferences, autoplay, callbacks, playFillerAsync, transitionPhase]);

  useEffect(() => {
    stopAndProcessRef.current = stopAndProcess;
  }, [stopAndProcess]);

  // ── Cleanup helper ────────────────────────────────────────────────────────
  const cleanupRef = useRef<((resetState: boolean) => Promise<void>) | undefined>(undefined);
  cleanupRef.current = async (resetState: boolean) => {
    console.log("[Mo] cleanup — resetState:", resetState);

    // Stop VAD polling first so it can't fire after recorder.stop()
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    stopLivePolling();
    setLiveTranscript("");

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
    answerFallbackRef.current = null;
    isPlayingAnswerRef.current = false;
    playbackStartedRef.current = false;

    if (answerSafetyTimerRef.current) {
      clearTimeout(answerSafetyTimerRef.current);
      answerSafetyTimerRef.current = null;
    }

    inflightRef.current = false;
    startingRef.current = false;

    if (resetState) {
      stateRef.current = "idle";
      setState("idle");
      transitionPhase("idle", { reason: "cleanup" });
    }
  };

  // ── AppState listener ─────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[Mo] mounting — registering AppState listener");

    const handleAppStateChange = (next: AppStateStatus) => {
      console.log("[Mo] AppState changed →", next);
      if (next === "background") {
        // App truly backgrounded (user switched apps or locked screen).
        // Clean up to avoid leaving a dangling recording or audio session.
        cleanupRef.current?.(true).catch(() => {});
      }
      // "inactive" → brief system interruptions (Android permission dialogs,
      // notification shade, screen-dim events). Do NOT clean up: killing an
      // in-progress recording here causes "no output" on the first-ever tap
      // because the mic-permission dialog triggers inactive → active before
      // record() has finished setting up, and the "active" return trip used
      // to fire a second cleanup that stopped the recording immediately.
      // "active" → returning to foreground after any interruption. Cleaning
      // up here was the root cause: it raced with startRecording() on Android
      // and killed the recording the moment it started.
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

    // Cancel any pending safety timeout
    if (answerSafetyTimerRef.current) {
      clearTimeout(answerSafetyTimerRef.current);
      answerSafetyTimerRef.current = null;
    }

    if (fillerSoundRef.current) {
      await fillerSoundRef.current.stopAsync().catch(() => {});
      await fillerSoundRef.current.unloadAsync().catch(() => {});
      fillerSoundRef.current = null;
    }

    if (answerPlayerRef.current.playing) {
      try { answerPlayerRef.current.pause(); } catch { /* ignore */ }
    }
    setAnswerSource(null);
    answerFallbackRef.current = null;
    isPlayingAnswerRef.current = false;
    playbackStartedRef.current = false;

    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    inflightRef.current = false;
    setStateSync("idle");
    transitionPhase("idle", { reason: "stop_speaking" });
  }, []);

  // ── cancelVoice ───────────────────────────────────────────────────────────
  // Full hand-off cleanup: stops any active recording/upload/playback and
  // forces the pipeline back to idle. Used when the carousel switches to a
  // different mode (persona) — a voice turn that started under the OLD
  // persona must never be allowed to complete and answer as the NEW one.
  // Safe to call when already idle (no-op via cleanupRef's own guards).
  const cancelVoice = useCallback(() => {
    if (stateRef.current === "idle") return;
    console.log("[Mo] cancelVoice — forcing pipeline back to idle. was:", stateRef.current, "phase:", phaseRef.current);
    cleanupRef.current?.(true).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (startingRef.current) {
      console.warn("[Mo] toggle — BLOCKED, start already in progress");
      return;
    }
    if (s === "idle" || s === "error") startRecording();
    else if (s === "listening") stopAndProcess();
    else if (s === "speaking") stopSpeaking();
  }, [startRecording, stopAndProcess, stopSpeaking]);

  return {
    state,
    mode,
    setMode,
    transcript,
    liveTranscript,
    reply,
    errorMessage,
    micLevel,
    toggle,
    cancelVoice,
    isIdle: state === "idle",
    isListening: state === "listening",
    isThinking: state === "thinking",
    isSpeaking: state === "speaking",
    isError: state === "error",
  };
}
