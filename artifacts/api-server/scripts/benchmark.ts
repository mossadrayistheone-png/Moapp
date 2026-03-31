/**
 * Mo Voice Pipeline — Latency Benchmark
 *
 * Measures real end-to-end timing across all pipeline stages by calling the
 * live /api/mo/voice endpoint. The server embeds per-stage ms in the response
 * body, so we get both client-side round-trip time and server-side breakdown.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server exec tsx scripts/benchmark.ts
 *
 * Requires the API server to be running at localhost:8080.
 */

import OpenAI from "openai";

const SERVER_URL  = "http://localhost:8080";
const RUNS        = 10;
const WARM_UP     = 1;   // discarded warm-up runs (cold-start noise)
const FORMAT      = "wav";

// ── Test phrase ───────────────────────────────────────────────────────────────
// Realistic executive-assistant question: short, clear, no tool-call triggers.
// 10 words → ~3 s of spoken audio at natural pace.
const TEST_PHRASE = "What should I prioritise to make today a focused success?";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PipelineTimings {
  ffmpegMs:  number | null;
  whisperMs: number | null;
  gptMs:     number | null;
  ttsMs:     number | null;
  stsMs:     number | null;
  totalMs:   number;
}

interface RunResult {
  run:           number;
  clientTotalMs: number;   // wall-clock round-trip from client perspective
  networkMs:     number;   // clientTotal − server totalMs (≈ network overhead)
  server:        PipelineTimings;
  transcript:    string;
  reply:         string;
  hasAudio:      boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad  = (s: string | number, w: number) => String(s).padStart(w);
const ms   = (n: number | null) => n == null ? "  n/a" : pad(n, 5);
const line = (char: string, len: number) => char.repeat(len);

function avg(arr: (number | null)[]): number | null {
  const valid = arr.filter((x): x is number => x != null);
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
}

function printTable(results: RunResult[]) {
  const header =
    `${"Run".padEnd(4)} ${"Client".padStart(7)} ${"Network".padStart(8)} ${"ffmpeg".padStart(7)} ${"Whisper".padStart(8)} ${"GPT".padStart(6)} ${"OAI-TTS".padStart(8)} ${"EL-STS".padStart(7)} ${"Srvr-Total".padStart(11)}`;
  const sep = line("─", header.length);

  console.log("\n" + sep);
  console.log(header);
  console.log(sep);

  for (const r of results) {
    const { server: s } = r;
    console.log(
      `${pad(r.run, 3)}  ` +
      `${pad(r.clientTotalMs, 7)}ms ` +
      `${pad(r.networkMs, 7)}ms ` +
      `${ms(s.ffmpegMs)}ms ` +
      `${ms(s.whisperMs)}ms ` +
      `${ms(s.gptMs)}ms ` +
      `${ms(s.ttsMs)}ms ` +
      `${ms(s.stsMs)}ms ` +
      `${pad(s.totalMs, 10)}ms` +
      (r.hasAudio ? "" : " ⚠ no audio")
    );
  }

  console.log(sep);

  const clientAvg  = avg(results.map(r => r.clientTotalMs))!;
  const networkAvg = avg(results.map(r => r.networkMs))!;
  const ffmpegAvg  = avg(results.map(r => r.server.ffmpegMs));
  const whisperAvg = avg(results.map(r => r.server.whisperMs));
  const gptAvg     = avg(results.map(r => r.server.gptMs));
  const ttsAvg     = avg(results.map(r => r.server.ttsMs));
  const stsAvg     = avg(results.map(r => r.server.stsMs));
  const srvrAvg    = avg(results.map(r => r.server.totalMs))!;

  console.log(
    `${"AVG".padEnd(4)} ` +
    `${pad(clientAvg, 7)}ms ` +
    `${pad(networkAvg, 7)}ms ` +
    `${ms(ffmpegAvg)}ms ` +
    `${ms(whisperAvg)}ms ` +
    `${ms(gptAvg)}ms ` +
    `${ms(ttsAvg)}ms ` +
    `${ms(stsAvg)}ms ` +
    `${pad(srvrAvg, 10)}ms`
  );
  console.log(sep + "\n");

  // ── Ranked bottleneck ──────────────────────────────────────────────────────
  const stages: [string, number | null][] = [
    ["ffmpeg",         ffmpegAvg],
    ["Whisper (STT)",  whisperAvg],
    ["GPT (LLM)",      gptAvg],
    ["OpenAI TTS",     ttsAvg],
    ["ElevenLabs STS", stsAvg],
    ["Network",        networkAvg],
  ].filter(([, v]) => v != null) as [string, number][];

  stages.sort((a, b) => (b[1] as number) - (a[1] as number));

  console.log("  Stage breakdown (slowest first):");
  for (const [name, val] of stages) {
    const pct = Math.round(((val as number) / srvrAvg) * 100);
    const bar = "█".repeat(Math.round(pct / 5));
    console.log(`    ${name.padEnd(18)} ${pad(val, 5)}ms  ${pad(pct, 3)}%  ${bar}`);
  }

  // ── Key metrics ────────────────────────────────────────────────────────────
  const fastest = results.reduce((a, b) => a.clientTotalMs < b.clientTotalMs ? a : b);
  const slowest = results.reduce((a, b) => a.clientTotalMs > b.clientTotalMs ? a : b);

  console.log(`
  ── Key metrics ──────────────────────────────────────────────────────────────
  Average total response (server):        ${srvrAvg} ms
  Average total response (client):        ${clientAvg} ms
  Network overhead (avg):                 ${networkAvg} ms
  Fastest run (client):       run ${fastest.run.toString().padStart(2)}   ${fastest.clientTotalMs} ms
  Slowest run (client):       run ${slowest.run.toString().padStart(2)}   ${slowest.clientTotalMs} ms

  ── Silent gap before audio playback ─────────────────────────────────────────
  The gap starts when the user finishes speaking and ends the moment the device
  starts playing audio. It equals: client round-trip time (${clientAvg} ms) plus
  the time the mobile app spends decoding the base64 audio (~50 ms).

  Average silent gap:   ≈ ${clientAvg + 50} ms  (${((clientAvg + 50) / 1000).toFixed(1)} s)
  ─────────────────────────────────────────────────────────────────────────────`);

  // ── Filler phrase recommendation ───────────────────────────────────────────
  const silentGap = clientAvg + 50;
  let fillerRec: string;
  if (silentGap < 2500) {
    fillerRec = `Very short — 1 word or a brief breath sound (e.g. "Mm." or a soft inhale).
    At ${silentGap} ms the gap is tight; a longer phrase would still be playing when Mo's real
    answer arrives, causing an awkward overlap.`;
  } else if (silentGap < 5000) {
    fillerRec = `Medium — a single short sentence (e.g. "Let me check that for you." ≈ 2 s).
    The ${silentGap} ms gap gives comfortable room for one sentence without an awkward
    second of silence after the filler ends.`;
  } else {
    fillerRec = `Multi-part — two short phrases or one sentence plus a pause marker.
    With a ${silentGap} ms gap you have time for something like "Thinking..." followed
    by a second cue, which keeps the conversation feeling alive throughout.`;
  }

  const durationLabel =
    silentGap < 2500 ? "very short (< 1 s)" :
    silentGap < 5000 ? "medium (1.5–3 s)" :
                       "multi-part (3–5 s)";

  console.log(`
  ── Filler phrase recommendation ─────────────────────────────────────────────
  Ideal filler duration:   ${durationLabel}
  Type:                    ${silentGap < 2500 ? "Very short" : silentGap < 5000 ? "Medium" : "Multi-part"}

  ${fillerRec}
  ─────────────────────────────────────────────────────────────────────────────
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log("Mo Voice Pipeline — Latency Benchmark");
  console.log("══════════════════════════════════════");
  console.log(`  Test phrase: "${TEST_PHRASE}"`);
  console.log(`  Runs: ${RUNS}  (+ ${WARM_UP} warm-up, discarded)`);
  console.log();

  // ── Step 1: Generate test audio ────────────────────────────────────────────
  process.stdout.write("  Generating test audio via OpenAI TTS... ");
  const t0 = Date.now();
  const ttsRes = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: TEST_PHRASE,
    response_format: "wav",
  });
  const audioBuffer   = Buffer.from(await ttsRes.arrayBuffer());
  const audioBase64   = audioBuffer.toString("base64");
  console.log(`done (${Date.now() - t0} ms, ${audioBuffer.byteLength} bytes)`);
  console.log();

  // ── Step 2: Run benchmark (warm-up + measured runs) ────────────────────────
  const allRuns    = WARM_UP + RUNS;
  const results: RunResult[] = [];

  for (let i = 1; i <= allRuns; i++) {
    const isWarmup = i <= WARM_UP;
    process.stdout.write(
      isWarmup
        ? `  Warm-up run ${i}/${WARM_UP}... `
        : `  Run ${(i - WARM_UP).toString().padStart(2)}/${RUNS}... `
    );

    const clientStart = Date.now();
    let body: any;
    try {
      const res = await fetch(`${SERVER_URL}/api/mo/voice`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio:   audioBase64,
          format:  FORMAT,
          mode:    "executive",
          messages: [],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      body = await res.json();
    } catch (err: any) {
      console.log(`FAILED: ${err.message}`);
      continue;
    }

    const clientTotalMs = Date.now() - clientStart;

    if (isWarmup) {
      console.log(`${clientTotalMs} ms (discarded)`);
      continue;
    }

    const timings: PipelineTimings = body.timings ?? {
      ffmpegMs: null, whisperMs: null, gptMs: null,
      ttsMs: null, stsMs: null, totalMs: clientTotalMs,
    };

    const networkMs = Math.max(0, clientTotalMs - (timings.totalMs ?? 0));
    const runNum    = i - WARM_UP;

    results.push({
      run:           runNum,
      clientTotalMs,
      networkMs,
      server:        timings,
      transcript:    body.transcript ?? "",
      reply:         body.reply ?? "",
      hasAudio:      !!(body.audioBase64),
    });

    console.log(
      `${clientTotalMs} ms  ` +
      `[whisper=${timings.whisperMs ?? "?"}ms ` +
      `gpt=${timings.gptMs ?? "?"}ms ` +
      `tts=${timings.ttsMs ?? "?"}ms ` +
      `sts=${timings.stsMs ?? "?"}ms]` +
      (body.audioBase64 ? "" : " ⚠ no audio") +
      (body.transcript  ? `  → "${body.transcript.slice(0, 40)}"` : "")
    );

    // Brief pause between runs to avoid rate limiting
    if (runNum < RUNS) await new Promise(r => setTimeout(r, 300));
  }

  if (!results.length) {
    console.error("\n  No results collected — is the server running at localhost:8080?");
    process.exit(1);
  }

  printTable(results);
}

main().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
