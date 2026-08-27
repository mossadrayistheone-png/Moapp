import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Increase body limit to handle base64-encoded audio recordings
// (a 10-second m4a recording can be ~300 KB base64-encoded, WebM larger)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// ── APK redirects — send browser directly to EAS CDN to avoid proxy limits ──
// Replit's dev proxy truncates large file streams. A 302 redirect means
// the browser fetches the 66 MB APK straight from EAS's CDN, not through us.
const APK_REDIRECTS: Record<string, string> = {
  "mo-app-v18.apk": "https://expo.dev/artifacts/eas/wrUDRiZQDbd6AvY9twNRv1.apk",
  "mo-app-v19.apk": "https://expo.dev/artifacts/eas/u4kzt5pPuReq3Gzf2UJxBT.apk",
  "mo-app-v20.apk": "https://expo.dev/artifacts/eas/6QEZFU3N1Rpj2ah6T5miTK.apk",
};

for (const [filename, url] of Object.entries(APK_REDIRECTS)) {
  app.get(`/api/download/${filename}`, (_req, res) => res.redirect(302, url));
  app.get(`/${filename}`, (_req, res) => res.redirect(302, url));
}

// NOTE: /api/mo/apk and /mo/apk are intentionally NOT handled here.
// They used to be a hardcoded redirect to a stale GitHub release
// ("mo-release-build20.apk") that pre-dates the current CI pipeline. That
// hardcoded route was registered before `router` below and therefore always
// won the match, silently shadowing routes/apk.ts's dynamic handler — every
// download served build 20 forever, no matter how many newer builds CI
// uploaded to GCS. The real, always-current handler lives in
// routes/apk.ts (GET /mo/apk, mounted at both "/" and "/api" below) and
// redirects to the object-storage URL that CI's upload step just wrote to.

// Serve static assets (APK downloads etc.)
const staticMiddleware = express.static(path.resolve("public"), {
  maxAge: "1d",
  setHeaders(res, filePath) {
    if (filePath.endsWith(".mp4")) {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");
    }
    if (filePath.endsWith(".apk")) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    }
  },
});
app.use(staticMiddleware);
// Also expose /api/download/* so APKs are reachable through the /api proxy path
app.use("/api/download", staticMiddleware);

// Mount at root so the Replit proxy (which strips the /api prefix before
// forwarding to port 8080) can reach routes like POST /mo/voice.
// Also mounted at /api so internal and direct-port access still work.
app.use(router);
app.use("/api", router);

export default app;
