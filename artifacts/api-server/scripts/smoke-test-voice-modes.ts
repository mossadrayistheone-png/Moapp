/**
 * Mo Voice Mode Smoke Test
 *
 * Posts a minimal silent audio payload to /api/mo/voice for each of the three
 * modes (executive, daily, luxury) and asserts the response is NOT a 400
 * validation error.
 *
 * Also tests the iOS ADTS AAC format path — verifies that format:"aac" is
 * accepted by Zod and reaches the pipeline (no regression from M4A → ADTS switch).
 *
 * Pass conditions per mode:
 *   ✓  2xx / 5xx   — request reached the voice pipeline; mode validation passed
 *   ✗  400         — Zod validation rejected the mode or body (the regression we catch)
 *   ✗  404         — route not found; wrong server URL or endpoint missing
 *   ✗  network err — server unreachable, DNS failure, or request timed out
 *   ✗  other 4xx   — unexpected client error (auth, rate-limit, etc.)
 *
 * Usage:
 *   pnpm --filter @workspace/api-server smoke-test
 *
 * Point at a remote server:
 *   MO_API_URL=https://your-server.example.com pnpm --filter @workspace/api-server smoke-test
 *
 * Verify the script itself correctly detects failures (self-test):
 *   pnpm --filter @workspace/api-server smoke-test:self-test
 *
 * Exit code 0 = all modes passed validation.
 * Exit code 1 = one or more modes failed, server unreachable, or bad URL.
 */

const MODES = ["executive", "daily", "luxury"] as const;

// ── Minimal silent WAV ────────────────────────────────────────────────────────
// 16 kHz, mono, 16-bit PCM, 0.25 s of silence (4000 samples = 8000 bytes data).
// Small enough to be fast; long enough for Whisper to accept without rejecting
// the file as malformed. The transcript will be empty — that's expected.
function buildSilentWav(durationSecs = 0.25): Buffer {
  const sampleRate  = 16_000;
  const numChannels = 1;
  const bitDepth    = 16;
  const numSamples  = Math.floor(sampleRate * durationSecs);
  const dataBytes   = numSamples * numChannels * (bitDepth / 8);
  const buf         = Buffer.alloc(44 + dataBytes, 0);

  buf.write("RIFF",                 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE",                 8, "ascii");
  buf.write("fmt ",                12, "ascii");
  buf.writeUInt32LE(16,            16);
  buf.writeUInt16LE(1,             20); // PCM
  buf.writeUInt16LE(numChannels,   22);
  buf.writeUInt32LE(sampleRate,    24);
  buf.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);
  buf.writeUInt16LE(numChannels * (bitDepth / 8), 32);
  buf.writeUInt16LE(bitDepth,      34);
  buf.write("data",                36, "ascii");
  buf.writeUInt32LE(dataBytes,     40);
  // samples remain zero (silence)

  return buf;
}

// ── Real ADTS AAC fixture ─────────────────────────────────────────────────────
// 0.5 s of silence encoded as ADTS AAC (AAC-LC, 16 kHz mono) by ffmpeg:
//   ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.5 -c:a aac -f adts out.aac
// Base64-encoded here so the test is self-contained (no runtime ffmpeg required).
// This is a real, decodable AAC stream — ffmpeg on the server can convert it to
// WAV and Whisper can transcribe it (returning empty text for silence). Using
// real audio ensures a 5xx from the server means a genuine pipeline failure
// (ffmpeg decode error or Whisper rejection), not a test fixture problem.
const ADTS_SILENCE_B64 =
  "//FgQAOf/N4CAExhdmM2MC4zMS4xMDIAAjBADv/xYEABf/wBGCAH//FgQAF//AEYIAf/8WBAAX" +
  "/8ARggB//xYEABf/wBGCAH//FgQAF//AEYIAf/8WBAAX/8ARggB//xYEABf/wBGCAH//FgQAF/" +
  "/AEYIAc=";

// ── Result types ──────────────────────────────────────────────────────────────

type FailReason =
  | "validation_error"   // 400 — Zod rejected the mode/body
  | "not_found"          // 404 — route missing or wrong URL
  | "unexpected_4xx"     // other 4xx — auth, rate-limit, etc.
  | "network_error";     // ECONNREFUSED, timeout, DNS failure, etc.

interface ModeResult {
  mode:       string;
  status:     number | null; // null = network error
  passed:     boolean;
  failReason: FailReason | null;
  detail:     string;
}

// ── Single mode check ─────────────────────────────────────────────────────────

async function checkMode(
  serverUrl: string,
  audioBase64: string,
  mode: string,
): Promise<ModeResult> {
  let status: number | null = null;
  let detail = "";
  let failReason: FailReason | null = null;

  try {
    const res = await fetch(`${serverUrl}/api/mo/voice`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: audioBase64, format: "wav", mode }),
      signal: AbortSignal.timeout(30_000),
    });

    status = res.status;

    let bodyText = "";
    try { bodyText = await res.text(); } catch { /* ignore */ }

    let bodyError = "";
    try { bodyError = (JSON.parse(bodyText) as { error?: string }).error ?? ""; } catch { /* ignore */ }

    if (status === 400) {
      failReason = "validation_error";
      detail     = bodyError || "400 — Zod validation rejected the request body";
    } else if (status === 404) {
      failReason = "not_found";
      detail     = "404 — endpoint not found; check MO_API_URL and server routing";
    } else if (status >= 400 && status < 500) {
      failReason = "unexpected_4xx";
      detail     = bodyError || `HTTP ${status} — unexpected client error`;
    } else if (status >= 200) {
      // 2xx or 5xx — request reached the voice pipeline; mode validation passed
      detail = status === 200
        ? "OK — pipeline reached"
        : (bodyError || `HTTP ${status} — server error (mode validation passed)`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    failReason = "network_error";
    detail     = `Network error: ${msg}`;
  }

  // A mode passes only when the request demonstrably reached the voice handler.
  // Any network failure or unexpected HTTP error is a failing condition.
  const passed = failReason === null;

  return { mode, status, passed, failReason, detail };
}

// ── iOS ADTS pipeline check ───────────────────────────────────────────────────
// Posts a real ADTS AAC payload (0.5 s silence) to /api/mo/voice and verifies
// the full pipeline succeeds (HTTP 200). This confirms that:
//   1. Zod accepts format:"aac" (no 400 schema regression)
//   2. ffmpeg can decode the ADTS stream to WAV (no 5xx decode failure)
//   3. Whisper accepts the WAV and returns a result (empty for silence — 200 OK)
//
// A 5xx here means ffmpeg failed to decode ADTS or Whisper rejected the result,
// which is a real regression — not a fixture problem — because ADTS_SILENCE_B64
// is a known-valid, ffmpeg-generated ADTS AAC stream.
async function checkAdtsPipeline(
  serverUrl: string,
): Promise<{ passed: boolean; status: number | null; detail: string }> {
  let status: number | null = null;
  let detail = "";
  let passed = false;

  try {
    const res = await fetch(`${serverUrl}/api/mo/voice`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: ADTS_SILENCE_B64, format: "aac", mode: "executive" }),
      signal: AbortSignal.timeout(35_000),
    });
    status = res.status;

    let bodyText = "";
    try { bodyText = await res.text(); } catch { /* ignore */ }

    let bodyError = "";
    try { bodyError = (JSON.parse(bodyText) as { error?: string }).error ?? ""; } catch { /* ignore */ }

    if (status === 200) {
      passed = true;
      detail = "OK — ADTS decoded by ffmpeg, Whisper accepted WAV, pipeline returned 200";
    } else if (status === 400) {
      detail = bodyError || '400 — Zod rejected format:"aac" (schema regression)';
    } else if (status === 404) {
      detail = "404 — endpoint not found; check MO_API_URL";
    } else if (status >= 400 && status < 500) {
      detail = bodyError || `HTTP ${status} — unexpected client error`;
    } else {
      // 5xx: pipeline error — ffmpeg decode failure, Whisper rejection, or timeout
      detail = bodyError || `HTTP ${status} — server error (ffmpeg/Whisper decode failure)`;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    detail = `Network error: ${msg}`;
  }

  return { passed, status, detail };
}

// ── Self-test ─────────────────────────────────────────────────────────────────
// Verifies that the script correctly exits non-zero for transport failures.
// Call via: pnpm smoke-test:self-test
//
// NOTE: This only tests the "unreachable server" case (no running server needed).
// The "wrong path → 404" case is omitted here because it requires the API server
// to be running at MO_API_URL — run the main smoke test for that coverage.

async function runSelfTest(): Promise<void> {
  console.log("Mo Voice Mode — Smoke Test Self-Verification");
  console.log("═════════════════════════════════════════════");
  console.log("  Checking that failure cases are correctly detected...");
  console.log("  (Network-only cases — no running server required.)");
  console.log();

  const silentWav   = buildSilentWav();
  const audioBase64 = silentWav.toString("base64");

  const cases: Array<{ label: string; serverUrl: string; mode: string; expectFail: boolean; expectReason?: FailReason }> = [
    {
      label:      "unreachable server → network error",
      serverUrl:  "http://localhost:1",
      mode:       "executive",
      expectFail: true,
      expectReason: "network_error",
    },
  ];

  let allOk = true;

  for (const { label, serverUrl, mode, expectFail, expectReason } of cases) {
    process.stdout.write(`  [${label}] ... `);
    const result = await checkMode(serverUrl, audioBase64, mode);

    const failedAsExpected = expectFail && !result.passed;
    const reasonMatches    = !expectReason || result.failReason === expectReason;
    const ok               = failedAsExpected && reasonMatches;

    if (ok) {
      console.log(`✓  correctly detected failure (${result.failReason})`);
    } else {
      console.log(`✗  unexpected result — passed=${result.passed}, reason=${result.failReason}, detail="${result.detail}"`);
      allOk = false;
    }
  }

  console.log();

  if (allOk) {
    console.log("  ✓ Self-test passed — failure detection is working correctly.");
    console.log();
    process.exit(0);
  } else {
    console.log("  ✗ Self-test failed — the script does not correctly detect some failures.");
    console.log();
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (process.argv.includes("--self-test")) {
    await runSelfTest();
    return;
  }

  const serverUrl = process.env.MO_API_URL ?? "http://localhost:8080";
  const silentWav = buildSilentWav();
  const wavBase64 = silentWav.toString("base64");

  console.log("Mo Voice Mode — Smoke Test");
  console.log("══════════════════════════");
  console.log(`  Server:  ${serverUrl}`);
  console.log(`  Modes:   ${MODES.join(", ")}`);
  console.log(`  Audio:   silent WAV, ${silentWav.byteLength} bytes`);
  console.log();

  const results: ModeResult[] = [];

  for (const mode of MODES) {
    process.stdout.write(`  [${mode.padEnd(9)}]  POST /api/mo/voice ... `);
    const result = await checkMode(serverUrl, wavBase64, mode);
    results.push(result);

    const icon      = result.passed ? "✓" : "✗";
    const statusStr = result.status != null ? String(result.status) : "---";
    console.log(`${icon}  ${statusStr}  ${result.detail}`);
  }

  console.log();
  console.log("──────────────────────────────────────────");

  const failed = results.filter(r => !r.passed);

  if (failed.length > 0) {
    // Group failures by reason for a clear diagnosis
    const byReason = new Map<FailReason, ModeResult[]>();
    for (const r of failed) {
      if (!r.failReason) continue;
      if (!byReason.has(r.failReason)) byReason.set(r.failReason, []);
      byReason.get(r.failReason)!.push(r);
    }

    console.log(`  ✗ ${failed.length}/${results.length} mode(s) failed:\n`);

    for (const [reason, items] of byReason) {
      const hint: Record<FailReason, string> = {
        validation_error:
          "  Hint: mode enum in openapi.yaml or api-zod generated schema is out of\n" +
          "        sync with the values the app sends. Check MoVoiceBody.mode in\n" +
          "        lib/api-zod/src/generated/api.ts and lib/api-spec/openapi.yaml.",
        not_found:
          "  Hint: endpoint not found. Is the API server running at the right URL?\n" +
          "        Set MO_API_URL=http://localhost:<port> if needed.",
        unexpected_4xx:
          "  Hint: unexpected client-side HTTP error. Check server logs for details.",
        network_error:
          "  Hint: could not reach the server. Start the API server first:\n" +
          "        pnpm --filter @workspace/api-server run dev",
      };

      console.log(`  ── ${reason} ──`);
      for (const r of items) {
        console.log(`     ${r.mode}: ${r.detail}`);
      }
      console.log();
      console.log(hint[reason]);
      console.log();
    }

    process.exit(1);
  }

  console.log("  ✓ All modes passed validation (no 400 or transport errors).");

  // ── iOS ADTS pipeline check ───────────────────────────────────────────────
  // Posts a real ffmpeg-generated ADTS AAC file (0.5 s silence) with
  // format:"aac" and requires HTTP 200. This confirms:
  //   1. Zod accepts "aac" (no schema regression)
  //   2. ffmpeg can decode ADTS → WAV (no decode regression)
  //   3. Whisper accepts the result (no transcription-stage regression)
  // 5xx or network errors are failures — they indicate a real pipeline break.
  console.log();
  console.log("iOS ADTS Pipeline Check");
  console.log("───────────────────────");
  console.log(`  Audio:   real ADTS AAC (ffmpeg-generated 0.5 s silence, ${Buffer.from(ADTS_SILENCE_B64, "base64").byteLength} bytes)`);
  console.log(`  Format:  aac (sent by iOS + Android clients)`);
  console.log(`  Pass:    HTTP 200 only — 5xx means ffmpeg/Whisper pipeline failure`);
  console.log();

  process.stdout.write(`  [format:aac]  POST /api/mo/voice ... `);
  const adtsResult  = await checkAdtsPipeline(serverUrl);
  const adtsIcon    = adtsResult.passed ? "✓" : "✗";
  const adtsStatus  = adtsResult.status != null ? String(adtsResult.status) : "---";
  console.log(`${adtsIcon}  ${adtsStatus}  ${adtsResult.detail}`);

  console.log();
  console.log("──────────────────────────────────────────");

  if (!adtsResult.passed) {
    console.log("  ✗ iOS ADTS pipeline check failed.\n");
    if (adtsResult.status === 400) {
      console.log('  Hint: format:"aac" was rejected by Zod (schema regression).');
      console.log("        Check MoVoiceBody.format in:");
      console.log("          lib/api-zod/src/generated/api.ts");
      console.log("          lib/api-spec/openapi.yaml  (VoiceRequest.format.enum)");
    } else {
      console.log("  Hint: the pipeline returned an error for a valid ADTS AAC file.");
      console.log("        This means ffmpeg failed to decode ADTS → WAV, or Whisper");
      console.log("        rejected the result. Check API server logs for details.");
    }
    console.log();
    process.exit(1);
  }

  console.log("  ✓ iOS ADTS pipeline confirmed — ADTS AAC decoded, transcribed, 200 OK.");
  console.log();
  process.exit(0);
}

main().catch(err => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
