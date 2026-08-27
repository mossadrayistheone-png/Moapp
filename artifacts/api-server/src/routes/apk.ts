/**
 * APK distribution routes
 *
 * POST /mo/apk — upload a new build (token-protected, used by CI)
 * GET  /mo/apk — permanent link; serves an HTML landing page with a freshly-
 *                signed GCS URL, both as a clickable download button and as
 *                plain copy-pasteable text
 *
 * The APK is stored at a fixed GCS path (apks/mo-latest.apk). This bucket
 * enforces uniform bucket-level access, so per-object ACLs (file.makePublic())
 * silently fail — a signed URL (minted via the Replit sidecar on every GET)
 * is used instead. GET /mo/apk itself is the stable, never-changing link;
 * only the signed URL embedded in the landing page rotates per request.
 *
 * Why a landing page instead of a raw 302 redirect: embedded/in-app browsers
 * (e.g. opening the link from inside a chat or another app) often fail to
 * hand a binary response off to the OS download manager when it arrives from
 * an automatic redirect. A real page with a user-clicked <a download> link,
 * plus the raw URL shown as selectable text to copy into a full browser, is
 * far more likely to complete on both paths.
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

// Signed URL TTL — generous enough that a manually-copied link pasted into a
// different app/browser a few minutes later still works.
const SIGNED_URL_TTL_MS = 30 * 60 * 1000;

async function signApkUrl(): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: APK_BUCKET_ID,
      object_name: APK_OBJECT_KEY,
      method: "GET",
      expires_at: new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to sign APK URL, status ${response.status}`);
  }
  const { signed_url: signedUrl } = (await response.json()) as { signed_url: string };
  return signedUrl;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderApkLandingPage(signedUrl: string): string {
  const safeUrl = escapeHtml(signedUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Download Mo</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #0b0b0d; color: #f2f2f2; margin: 0; padding: 24px 16px;
         display: flex; flex-direction: column; align-items: center; min-height: 100vh; box-sizing: border-box; }
  h1 { font-size: 20px; margin: 12px 0 4px; }
  p.sub { color: #9a9a9f; font-size: 14px; margin: 0 0 28px; text-align: center; max-width: 360px; }
  a.download-btn { display: block; width: 100%; max-width: 340px; text-align: center;
         background: #6c5ce7; color: #fff; font-size: 17px; font-weight: 600;
         padding: 16px 0; border-radius: 12px; text-decoration: none; margin-bottom: 20px; }
  a.download-btn:active { opacity: 0.85; }
  .copy-box { width: 100%; max-width: 340px; }
  .copy-label { font-size: 12px; color: #9a9a9f; margin-bottom: 6px; }
  .copy-row { display: flex; gap: 8px; }
  input.link-field { flex: 1; min-width: 0; background: #1a1a1e; color: #e6e6e6; border: 1px solid #2c2c31;
         border-radius: 8px; padding: 10px 12px; font-size: 13px; }
  button.copy-btn { background: #232327; color: #fff; border: 1px solid #2c2c31; border-radius: 8px;
         padding: 0 16px; font-size: 13px; }
  .hint { color: #6f6f76; font-size: 12px; margin-top: 24px; text-align: center; max-width: 340px; line-height: 1.5; }
</style>
</head>
<body>
  <h1>Mo — Android APK</h1>
  <p class="sub">Tap the button to download and install. If the download doesn't finish, copy the link below and open it in Chrome.</p>
  <a class="download-btn" id="dl" href="${safeUrl}" download="mo.apk">Download APK</a>
  <div class="copy-box">
    <div class="copy-label">Or copy this link:</div>
    <div class="copy-row">
      <input class="link-field" id="link" type="text" readonly value="${safeUrl}" onclick="this.select()">
      <button class="copy-btn" id="copyBtn" type="button">Copy</button>
    </div>
  </div>
  <p class="hint">This link expires in 30 minutes. If it stops working, reload this page for a fresh one. Reload also gets you a fresh link if you plan to paste it into Chrome instead of tapping the button.</p>
  <script>
    document.getElementById('copyBtn').addEventListener('click', function () {
      var field = document.getElementById('link');
      field.select();
      field.setSelectionRange(0, 99999);
      var done = function () {
        var btn = document.getElementById('copyBtn');
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(field.value).then(done).catch(function () {
          document.execCommand('copy'); done();
        });
      } else {
        document.execCommand('copy'); done();
      }
    });
  </script>
</body>
</html>`;
}

// GET /mo/apk — permanent download link for the latest APK. Serves an HTML
// landing page (not a raw redirect) with both a clickable download button and
// the same URL shown as plain, selectable text for manual copy/paste.
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
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(renderApkLandingPage(signedUrl));
  } catch (err) {
    logger.error(err, "APK landing page failed");
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
