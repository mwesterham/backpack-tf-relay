import { RelayMetrics } from "./metrics/RelayMetrics.js";
import { WebSocketRelay, RelayOptions } from "./relay/WebSocketRelay.js";

const defaultConfig: RelayOptions = {
  sourceUrl: process.env.SOURCE_URL ?? "wss://ws.backpack.tf/events",
  port: Number(process.env.RELAY_PORT ?? "8080"),
  path: process.env.RELAY_PATH ?? "/forwarded",
  clientToSource: (process.env.CLIENT_TO_SOURCE ?? "false") === "true",
  pingIntervalMs: 30_000
};

const metrics = new RelayMetrics();
const relay = new WebSocketRelay(defaultConfig, metrics);
relay.start();
