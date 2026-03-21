import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { useCallback, useRef, useState } from "react";

export type AssistantState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";
export type AssistantMode = "executive" | "creative" | "motivational";

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

export function useVoice() {
  const [state, setState] = useState<AssistantState>("idle");
  const [mode, setMode] = useState<AssistantMode>("executive");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const stateRef = useRef<AssistantState>("idle");

  const setStateWithRef = (s: AssistantState) => {
    stateRef.current = s;
    setState(s);
  };

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setErrorMessage("Microphone permission denied.");
        setStateWithRef("error");
        setTimeout(() => setStateWithRef("idle"), 3000);
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
      setStateWithRef("listening");
    } catch (err) {
      console.error("Failed to start recording:", err);
      setErrorMessage("Could not start recording.");
      setStateWithRef("error");
      setTimeout(() => setStateWithRef("idle"), 3000);
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
        setStateWithRef("idle");
        return;
      }

      setStateWithRef("thinking");

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch(`${BASE_URL}/api/mo/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: audioBase64, format: "m4a", mode }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `Server error ${response.status}`);
      }

      const data = await response.json();
      const {
        transcript: tx,
        reply: rp,
        audioBase64: audiob64,
      } = data as {
        transcript: string;
        reply: string;
        audioBase64: string;
      };

      if (!tx.trim() || !rp || !audiob64) {
        setStateWithRef("idle");
        return;
      }

      setTranscript(tx);
      setReply(rp);

      const audioPath = `${FileSystem.cacheDirectory}mo-reply.mp3`;
      await FileSystem.writeAsStringAsync(audioPath, audiob64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Natural pre-speech pause
      await new Promise<void>((resolve) => setTimeout(resolve, 650));

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
          setStateWithRef("idle");
          sound.unloadAsync();
        }
      });

      setStateWithRef("speaking");
      await sound.playAsync();
    } catch (err: any) {
      console.error("Voice pipeline error:", err);
      setErrorMessage(err?.message ?? "Something went wrong.");
      setStateWithRef("error");
      setTimeout(() => setStateWithRef("idle"), 3000);
    }
  }, [mode]);

  const stopSpeaking = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      soundRef.current = null;
    }
    setStateWithRef("idle");
  }, []);

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s === "idle" || s === "error") {
      startRecording();
    } else if (s === "listening") {
      stopAndProcess();
    } else if (s === "speaking") {
      stopSpeaking();
    }
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
