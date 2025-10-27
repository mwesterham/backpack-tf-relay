import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import ReconnectingWebSocket from "reconnecting-websocket";
import pino from "pino";
import { RelayMetrics } from "../metrics/RelayMetrics";

export interface RelayOptions {
  sourceUrl: string;
  port: number;
  path: string;
  clientToSource: boolean;
  pingIntervalMs: number;
}

export class WebSocketRelay {
  private logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

  private sourceUrl: string;
  private port: number;
  private path: string;
  private clientToSource: boolean;
  private pingIntervalMs: number;

  private source: ReconnectingWebSocket | null = null;
  private clients = new Set<WebSocket>();
  private pingInterval: NodeJS.Timeout | null = null;

  private server: http.Server;
  private wss: WebSocketServer;

  constructor(
    options: RelayOptions,
    private metrics: RelayMetrics // inject metrics
  ) {
    this.sourceUrl = options.sourceUrl;
    this.port = options.port;
    this.path = options.path;
    this.clientToSource = options.clientToSource;
    this.pingIntervalMs = options.pingIntervalMs;

    this.server = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.server, path: this.path });
    this.wss.on("connection", this.handleClientConnection.bind(this));
  }

  public start() {
    this.server.listen(this.port, () => {
      this.logger.info(`WebSocket relay listening on ws://0.0.0.0:${this.port}${this.path}`);
      this.connectToSource();
      this.startClientPing();
      this.setupShutdown();
    });
  }

  private connectToSource() {
    this.logger.info(`Connecting to source: ${this.sourceUrl}`);
    this.metrics.sourceReconnects.inc();

    this.source = new ReconnectingWebSocket(this.sourceUrl, [], {
      WebSocket,
      connectionTimeout: 5000,
      maxRetries: Infinity,
      debug: false
    });

    this.source.addEventListener("open", () => {
      this.logger.info("Connected to source WebSocket.");
      this.metrics.sourceConnected.set(1);
    });

    this.source.addEventListener("close", (event) => {
      this.logger.warn(`Source closed (code=${event.code}). Reconnecting...`);
      this.metrics.sourceConnected.set(0);
      this.metrics.sourceReconnects.inc();
    });

    this.source.addEventListener("message", (event) => {
      const payload = typeof event.data === "string" ? event.data : event.data.toString();
      
      // Count SKU updates
      try {
        const updates = JSON.parse(payload); // guaranteed to be a list
        if (Array.isArray(updates)) {
          this.metrics.skuUpdatesForwarded.inc(updates.length);
        }
      } catch (err) {
        this.logger.warn({ err, payload }, "Failed to parse message for SKU updates");
        this.metrics.failedSkuParse.inc(); // increment parse failure metric
      }

      // Forward message to clients
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(payload);
            this.metrics.messagesForwarded.inc();
          } catch (err) {
            this.logger.warn({ err }, "Failed to send to client");
            this.metrics.connectedClients.set(this.clients.size);
          }
        }
      }
    });

    this.source.addEventListener("error", (err) => {
      this.logger.error({ err }, "Source WebSocket error");
      this.metrics.sourceConnected.set(0);
    });
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      const ready = this.source?.readyState === WebSocket.OPEN;
      res.end(ready ? "ok" : "degraded");
      return;
    }

    if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": this.metrics.getContentType() });
      const metrics = await this.metrics.getMetrics();
      res.end(metrics);
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private handleClientConnection(ws: WebSocket, req: http.IncomingMessage) {
    this.logger.info({ ip: req.socket.remoteAddress }, "Client connected");
    this.clients.add(ws);
    this.metrics.connectedClients.set(this.clients.size);

    ws.on("message", (data) => {
      const msg = typeof data === "string" ? data : data.toString();
      if (this.clientToSource && this.source && this.source.readyState === WebSocket.OPEN) {
        try { this.source.send(msg); } catch (err) { this.logger.warn({ err }, "Failed to forward client message to source"); }
      }
    });

    ws.on("close", () => {
      this.logger.info("Client disconnected");
      this.clients.delete(ws);
      this.metrics.connectedClients.set(this.clients.size);
    });
  }

  private startClientPing() {
    this.pingInterval = setInterval(() => {
      for (const ws of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.ping(); } catch (err) { this.logger.warn({ err }, "Client ping failed"); }
        } else {
          this.clients.delete(ws);
          this.metrics.connectedClients.set(this.clients.size);
        }
      }
    }, this.pingIntervalMs);
  }

  private setupShutdown() {
    const shutdown = () => {
      this.logger.info("Shutting down...");
      if (this.pingInterval) clearInterval(this.pingInterval);

      for (const ws of this.clients) { try { ws.close(1001, "server-shutdown"); } catch {} }
      if (this.source && this.source.readyState === WebSocket.OPEN) { try { this.source.close(1001, "server-shutdown"); } catch {} }

      this.server.close(() => { this.logger.info("HTTP server closed"); process.exit(0); });
      setTimeout(() => process.exit(0), 5000);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
