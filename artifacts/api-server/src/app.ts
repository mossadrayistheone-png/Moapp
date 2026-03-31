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

// Serve static assets (e.g. background.mp4 for the mobile app)
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

app.use("/api", router);

export default app;
