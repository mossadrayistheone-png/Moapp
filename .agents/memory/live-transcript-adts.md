---
name: Live transcript via ADTS partial reads
description: How Mo shows a rolling transcript while recording, and the format/codegen constraints behind it
---

# Live transcript via ADTS partial reads

Rule: Android records ADTS AAC (`.aac`, `outputFormat: "aac_adts"`) instead of m4a so the partial file can be read mid-recording and posted to the server for best-effort live captions. iOS/web keep m4a/webm and gracefully hide the live transcript (mp4 containers write their moov index at stop — partial files are undecodable).

**Why:** MP4/M4A is not streamable mid-write; ADTS is a raw frame stream that ffmpeg decodes even when truncated. Whisper then transcribes the partial WAV. Verified with a truncated ADTS upload.

**How to apply:** Any mid-recording read of the audio file (live captions, progressive upload) requires a streamable container. Keep server-side ffmpeg normalisation format-agnostic; live-caption endpoints must fail soft (return empty text, never an error the client surfaces).

Also: `lib/api-zod/src/generated/` is hand-maintained ahead of `lib/api-spec/openapi.yaml` (generated says 0.6.0, spec is 0.5.0 and missing `notes` etc.). Running orval codegen regenerates from the stale spec and silently drops fields — edit the generated file by hand (or fully update the spec first), never blindly re-run codegen.
