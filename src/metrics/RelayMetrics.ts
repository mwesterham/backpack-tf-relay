// RelayMetrics.ts
import client from "prom-client";

export class RelayMetrics {
  public connectedClients = new client.Gauge({ name: "relay_connected_clients", help: "Number of connected WebSocket clients" });
  public messagesForwarded = new client.Counter({ name: "relay_messages_forwarded_total", help: "Total messages forwarded from source to clients" });
  public sourceConnected = new client.Gauge({ name: "relay_source_connected", help: "Source connection state" });
  public sourceReconnects = new client.Counter({ name: "relay_source_reconnects_total", help: "Total source reconnections" });

  // SKU updates
  public skuUpdatesForwarded = new client.Counter({
    name: "relay_sku_updates_forwarded_total",
    help: "Total number of SKU updates forwarded to clients",
  });

  // Failure metrics
  public failedClientSend = new client.Counter({
    name: "relay_failed_client_send_total",
    help: "Total number of messages failed to send to clients",
  });

  public failedSkuParse = new client.Counter({
    name: "relay_failed_sku_parse_total",
    help: "Total number of messages failed to parse for SKU updates",
  });

  public getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  public getContentType(): string {
    return client.register.contentType;
  }
}
