/**
 * APK distribution routes
 *
 * POST /mo/apk — upload a new build (token-protected, used by CI)
 * GET  /mo/apk — permanent link; redirects to a freshly-signed GCS URL
 *
 * The APK is stored at a fixed GCS path (apks/mo-latest.apk). This bucket
 * enforces uniform bucket-level access, so per-object ACLs (file.makePublic())
 * silently fail — a signed URL (minted via the Replit sidecar on every GET)
 * is used instead. GET /mo/apk itself is the stable, never-changing link;
 * only the signed URL it redirects to rotates per request.
 */

import { Router, type Request, type Response } from "express";
import { Storage } from "@google-cloud/storage";
import { logger } from "../lib/logger.js";

const router = Router();

// ── GCS client (Replit sidecar auth) ────────────────────────────────────────
const REPLIT_SIDECAR = "http://127.0.0.1:1106";
const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

const APK_BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
const APK_OBJECT_KEY = "apks/mo-latest.apk";

async function signApkUrl(): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: APK_BUCKET_ID,
      object_name: APK_OBJECT_KEY,
      method: "GET",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to sign APK URL, status ${response.status}`);
  }
  const { signed_url: signedUrl } = (await response.json()) as { signed_url: string };
  return signedUrl;
}

// GET /mo/apk — permanent download link for the latest APK
router.get("/mo/apk", async (_req: Request, res: Response) => {
  if (!APK_BUCKET_ID) {
    res.status(503).json({ error: "Object storage not configured" });
    return;
  }
  try {
    const file = gcs.bucket(APK_BUCKET_ID).file(APK_OBJECT_KEY);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: "No APK available yet — run a build first" });
      return;
    }
    const signedUrl = await signApkUrl();
    // 302 → freshly-signed GCS URL; Android fetches straight from GCS
    res.redirect(302, signedUrl);
  } catch (err) {
    logger.error(err, "APK redirect failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /mo/apk — receive a raw APK binary and store it in GCS
// Protected by a shared secret token (set APK_UPLOAD_TOKEN in Replit Secrets
// and as a GitHub Actions secret with the same name).
router.post("/mo/apk", async (req: Request, res: Response) => {
  const expectedToken = process.env.APK_UPLOAD_TOKEN;
  if (!expectedToken) {
    res.status(503).json({ error: "APK_UPLOAD_TOKEN not configured on server" });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  if (authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!APK_BUCKET_ID) {
    res.status(503).json({ error: "Object storage not configured" });
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("octet-stream") && !contentType.includes("android")) {
    res.status(400).json({
      error: "Send APK as Content-Type: application/octet-stream",
    });
    return;
  }

  try {
    const file = gcs.bucket(APK_BUCKET_ID).file(APK_OBJECT_KEY);
    const writeStream = file.createWriteStream({
      metadata: { contentType: "application/vnd.android.package-archive" },
      resumable: false, // single-shot for files < ~150 MB
    });

    await new Promise<void>((resolve, reject) => {
      req.pipe(writeStream).on("finish", resolve).on("error", reject);
    });

    const [meta] = await file.getMetadata();
    logger.info({ size: meta.size, key: APK_OBJECT_KEY }, "APK stored in GCS");

    res.json({ ok: true, url: "/api/mo/apk", size: meta.size });
  } catch (err) {
    logger.error(err, "APK upload to GCS failed");
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
