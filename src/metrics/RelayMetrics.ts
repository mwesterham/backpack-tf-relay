// RelayMetrics.ts
import client from "prom-client";

export class RelayMetrics {
  public connectedClients = new client.Gauge({ name: "relay_connected_clients", help: "Number of connected WebSocket clients" });
  public messagesForwarded = new client.Counter({ name: "relay_messages_forwarded_total", help: "Total messages forwarded from source to clients" });
  public sourceConnected = new client.Gauge({ name: "relay_source_connected", help: "Source connection state" });
  public sourceReconnects = new client.Counter({ name: "relay_source_reconnects_total", help: "Total source reconnections" });

  // expose registry so HTTP handler can use it
  public getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  public getContentType(): string {
    return client.register.contentType;
  }
}
