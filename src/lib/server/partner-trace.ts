import { createHash } from "node:crypto";
import { logAgentEvent } from "./agent-run-log";

async function describeBody(body: RequestInit["body"]) {
  if (typeof body === "string") { try { return JSON.parse(body); } catch { return body; } }
  if (body instanceof URLSearchParams) return Object.fromEntries(body);
  if (body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of body.entries()) fields[key] = typeof value === "string" ? value : { filename: value.name, mime_type: value.type, bytes: value.size, sha256: createHash("sha256").update(Buffer.from(await value.arrayBuffer())).digest("hex"), binary_omitted: true };
    return fields;
  }
  return body ? "Binary/stream body omitted" : null;
}
// Credentials and binaries never enter the trace. Response bodies are read from a clone.
export async function tracedPartnerFetch(runId: string | undefined, provider: string, endpoint: string, init: RequestInit = {}) {
  const call_id = crypto.randomUUID();
  await logAgentEvent(runId, "tool_call", { call_id, provider, connector: `${provider} REST`, source: endpoint, endpoint, method: init.method || "GET", request: await describeBody(init.body), credential_headers_omitted: true });
  try {
    const response = await fetch(endpoint, { ...init, signal: init.signal || AbortSignal.timeout(30000) });
    const content_type = response.headers.get("content-type") || "";
    let result: unknown;
    if (/json|text|xml/i.test(content_type)) {
      const text = await response.clone().text();
      try { result = JSON.parse(text); } catch { result = text; }
    } else {
      const bytes = Buffer.from(await response.clone().arrayBuffer());
      result = { content_type, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), binary_omitted: true };
    }
    await logAgentEvent(runId, "tool_response", { call_id, provider, connector: `${provider} REST`, endpoint, status: response.status, response: result });
    return response;
  } catch (error) {
    await logAgentEvent(runId, "tool_response", { call_id, provider, connector: `${provider} REST`, endpoint, status: "network_error", response: error instanceof Error ? error.message : "Request failed" });
    throw error;
  }
}
