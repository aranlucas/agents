import { registerOTel } from "@vercel/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "agents-nextjs",
    traceExporter: new OTLPTraceExporter({
      url: endpoint.endsWith("/v1/traces")
        ? endpoint
        : `${endpoint.replace(/\/$/, "")}/v1/traces`,
    }),
  });
}
