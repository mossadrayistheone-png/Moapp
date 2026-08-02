---
name: expo-audio recording migration
description: Why expo-av Audio.Recording was replaced with expo-audio, and the exact API differences.
---

## Rule
Use `expo-audio` for ALL audio recording. Never use `expo-av` Audio.Recording on New Architecture.

**Why:** expo-av `Audio.Recording` on New Architecture (Fabric / newArchEnabled=true) writes empty or near-empty files (observed: 3 bytes). Whisper rejects them with "Invalid file format." The video component had the same crash pattern — this is a systemic expo-av + New Architecture incompatibility.

**How to apply:** Any hook or component that records audio must import from `expo-audio`, not `expo-av`.

## API differences (expo-av → expo-audio)

| expo-av | expo-audio |
|---|---|
| `new Audio.Recording()` | `useAudioRecorder(options)` hook — persistent instance |
| `recording.prepareToRecordAsync(opts)` | `recorder.prepareToRecordAsync()` (options passed to hook) |
| `recording.startAsync()` | `recorder.record()` (sync, no await) |
| `recording.stopAndUnloadAsync()` | `await recorder.stop()` |
| `recording.getURI()` | `recorder.uri` (property) |
| `await recording.getStatusAsync()` | `recorder.getStatus()` (sync!) returns `RecorderState` |
| `status.metering` | `status.metering` (same field name) |
| `Audio.requestPermissionsAsync()` | `requestRecordingPermissionsAsync()` from expo-audio |
| `Audio.setAudioModeAsync({ allowsRecordingIOS, playsInSilentModeIOS })` | `setAudioModeAsync({ allowsRecording, playsInSilentMode })` from expo-audio |

## RecordingOptions format change
```ts
// expo-audio format (extension is top-level, outputFormat uses strings)
const opts: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM, ... },
};
```

## What still uses expo-av
`Audio.Sound` (playback of filler + answer audio) remains on expo-av — this works fine on New Architecture.

## Pattern for persistent recorder
```ts
const recorder = useAudioRecorder(RECORDING_OPTIONS); // hook level
const recordingActive = useRef(false);

// start:
await recorder.prepareToRecordAsync();
recorder.record();
recordingActive.current = true;

// stop:
await recorder.stop();
recordingActive.current = false;
const uri = recorder.uri;
```
