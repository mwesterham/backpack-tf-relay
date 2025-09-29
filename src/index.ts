import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const SOURCE_URL = process.env.SOURCE_URL ?? "wss://ws.backpack.tf/events";
const RELAY_PORT = Number(process.env.RELAY_PORT ?? "8080");
const RELAY_PATH = process.env.RELAY_PATH ?? "/forwarded";
const CLIENT_TO_SOURCE = (process.env.CLIENT_TO_SOURCE ?? "false") === "true";

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const PING_INTERVAL_MS = 30_000;

let source: WebSocket | null = null;
let backoff = INITIAL_BACKOFF_MS;
const clients = new Set<WebSocket>();

/** connect to the source websocket with exponential backoff */
function connectToSource() {
  console.info(`Connecting to source: ${SOURCE_URL}`);
  source = new WebSocket(SOURCE_URL);

  source.on("open", () => {
    console.info("Connected to source WebSocket.");
    backoff = INITIAL_BACKOFF_MS;
  });

  source.on("message", (data) => {
    const payload = typeof data === "string" ? data : data.toString();
    // Broadcast to clients
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) {
        try {
          c.send(payload);
        } catch (err) {
          console.warn("Failed to send to client:", err);
        }
      }
    }
  });

  source.on("error", (err) => {
    console.error("Source WebSocket error:", err instanceof Error ? err.message : err);
  });

  source.on("close", (code, reason) => {
    console.warn(`Source closed (code=${code}) reason=${reason.toString()}. Reconnecting in ${backoff}ms`);
    source = null;
    setTimeout(() => {
      backoff = Math.min(Math.round(backoff * 1.5), MAX_BACKOFF_MS);
      connectToSource();
    }, backoff + jitter(backoff));
  });
}

/** small jitter to avoid thundering herd */
function jitter(ms: number) {
  return Math.floor(Math.random() * Math.min(1000, Math.floor(ms / 2)));
}

/** Setup HTTP server + WebSocketServer so we can expose a health endpoint */
const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: RELAY_PATH });

wss.on("connection", (ws, req) => {
  console.info("Client connected:", req.socket.remoteAddress);
  clients.add(ws);

  ws.on("message", (data) => {
    const msg = typeof data === "string" ? data : data.toString();
    // Optionally forward client -> source (bidirectional)
    if (CLIENT_TO_SOURCE && source && source.readyState === WebSocket.OPEN) {
      try {
        source.send(msg);
      } catch (err) {
        console.warn("Failed to forward client message to source:", err);
      }
    }
  });

  ws.on("close", () => {
    console.info("Client disconnected.");
    clients.delete(ws);
  });
});

/** Keep clients alive via ping/pong; close stale clients */
const pingInterval = setInterval(() => {
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      // optionally, you can track pongs and close if unresponsive
    } else {
      clients.delete(ws);
    }
  }
}, PING_INTERVAL_MS);

/** Graceful shutdown */
function shutdown() {
  console.info("Shutting down...");
  clearInterval(pingInterval);
  for (const ws of clients) {
    try { ws.close(1001, "server-shutdown"); } catch {}
  }
  if (source && source.readyState === WebSocket.OPEN) {
    try { source.close(1001, "server-shutdown"); } catch {}
  }
  server.close(() => {
    console.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/** start listening and connect to source */
server.listen(RELAY_PORT, () => {
  console.info(`WebSocket relay listening on ws://0.0.0.0:${RELAY_PORT}${RELAY_PATH}`);
  connectToSource();
});
