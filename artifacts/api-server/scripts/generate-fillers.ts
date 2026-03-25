/**
 * Generate Mo's 10 filler phrase audio files via the STS pipeline.
 * Output: artifacts/mo-app/assets/fillers/filler-01.mp3 … filler-10.mp3
 *
 * Usage: pnpm --filter @workspace/api-server exec tsx scripts/generate-fillers.ts
 * Requires the API server running at localhost:8080.
 */

import fs from "fs";
import path from "path";

const SERVER_URL  = "http://localhost:8080";
const OUT_DIR     = path.resolve("../mo-app/assets/fillers");

const PHRASES = [
  "Certainly… one moment.",
  "Right away… let me check.",
  "Understood… give me a moment.",
  "Of course… I'll handle that.",
  "Very well… one moment please.",
  "Absolutely… working on that now.",
  "Alright… let me take a look.",
  "Consider it done… just a moment.",
  "I'm on it… one moment.",
  "Let me pull that up for you.",
];

async function generateFiller(idx: number, text: string): Promise<void> {
  const filename = `filler-${String(idx + 1).padStart(2, "0")}.mp3`;
  const outPath  = path.join(OUT_DIR, filename);

  process.stdout.write(`  [${idx + 1}/10] "${text}" → ${filename} ... `);
  const t0 = Date.now();

  const res = await fetch(`${SERVER_URL}/api/mo/speak`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ text }),
    signal:  AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, audio);
  console.log(`done (${Date.now() - t0}ms, ${audio.byteLength} bytes)`);
}

async function main() {
  console.log("Mo Filler Phrase Generator");
  console.log("══════════════════════════");
  console.log(`Output: ${OUT_DIR}`);
  console.log();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (let i = 0; i < PHRASES.length; i++) {
    await generateFiller(i, PHRASES[i]);
    // Small gap between requests to avoid rate limiting
    if (i < PHRASES.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  console.log("\nAll 10 filler phrases generated successfully.");
  console.log("Bundle these assets in the Expo app via the FILLER_ASSETS array.");
}

main().catch(err => {
  console.error("Generation failed:", err);
  process.exit(1);
});
