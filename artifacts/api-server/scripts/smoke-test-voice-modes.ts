/**
 * Mo Voice Mode Smoke Test
 *
 * Posts a minimal silent audio payload to /api/mo/voice for each of the three
 * modes (executive, daily, luxury) and asserts the response is NOT a 400
 * validation error.
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

// ── Self-test ─────────────────────────────────────────────────────────────────
// Verifies that the script correctly exits non-zero when the server is
// unreachable or returns a 400/404. Call via: pnpm smoke-test:self-test

async function runSelfTest(): Promise<void> {
  console.log("Mo Voice Mode — Smoke Test Self-Verification");
  console.log("═════════════════════════════════════════════");
  console.log("  Checking that failure cases are correctly detected...");
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
    {
      label:      "wrong URL path → 404",
      // Use the real server but a path that will never resolve
      serverUrl:  "http://localhost:8080/nonexistent-prefix",
      mode:       "executive",
      expectFail: true,
      expectReason: "not_found",
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

  const serverUrl   = process.env.MO_API_URL ?? "http://localhost:8080";
  const silentWav   = buildSilentWav();
  const audioBase64 = silentWav.toString("base64");

  console.log("Mo Voice Mode — Smoke Test");
  console.log("══════════════════════════");
  console.log(`  Server:  ${serverUrl}`);
  console.log(`  Modes:   ${MODES.join(", ")}`);
  console.log(`  Audio:   silent WAV, ${silentWav.byteLength} bytes`);
  console.log();

  const results: ModeResult[] = [];

  for (const mode of MODES) {
    process.stdout.write(`  [${mode.padEnd(9)}]  POST /api/mo/voice ... `);
    const result = await checkMode(serverUrl, audioBase64, mode);
    results.push(result);

    const icon       = result.passed ? "✓" : "✗";
    const statusStr  = result.status != null ? String(result.status) : "---";
    console.log(`${icon}  ${statusStr}  ${result.detail}`);
  }

  console.log();
  console.log("──────────────────────────────────────────");

  const failed = results.filter(r => !r.passed);

  if (failed.length === 0) {
    console.log("  ✓ All modes passed validation (no 400 or transport errors).");
    console.log();
    process.exit(0);
  }

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

main().catch(err => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
