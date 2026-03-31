import "dotenv/config";
import http from "http";
import { WebSocketServer } from "ws";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { handleRealtimeConnection } from "./routes/realtime.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);

// Attach a WebSocket server to the same HTTP server.
// The Realtime voice endpoint lives at /api/mo/realtime so it sits
// under the same /api prefix as all REST routes.
const wss = new WebSocketServer({ server: httpServer, path: "/api/mo/realtime" });

wss.on("connection", (ws, req) => {
  logger.info({ url: req.url, ip: req.socket.remoteAddress }, "Realtime WS connected");
  handleRealtimeConnection(ws, req);
});

wss.on("error", (err) => {
  logger.error({ err }, "WebSocket server error");
});

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
