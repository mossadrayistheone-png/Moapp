/**
 * APK distribution routes
 *
 * POST /mo/apk — upload a new build (token-protected, used by CI)
 * GET  /mo/apk — redirect to the permanent GCS public URL for the latest build
 *
 * The APK is stored at a fixed GCS path (apks/mo-latest.apk) and made public,
 * so the redirect target never changes between builds.
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
// Permanent public GCS URL — this never changes between builds
const APK_PUBLIC_URL = `https://storage.googleapis.com/${APK_BUCKET_ID}/${APK_OBJECT_KEY}`;

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
    // 302 → permanent GCS public URL; Android fetches straight from GCS CDN
    res.redirect(302, APK_PUBLIC_URL);
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

    // Make the object publicly readable so the GCS URL never requires auth
    await file.makePublic();

    const [meta] = await file.getMetadata();
    logger.info({ size: meta.size, url: APK_PUBLIC_URL }, "APK stored in GCS");

    res.json({ ok: true, url: APK_PUBLIC_URL, size: meta.size });
  } catch (err) {
    logger.error(err, "APK upload to GCS failed");
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
