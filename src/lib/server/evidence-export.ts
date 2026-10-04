import type { recentAgentEvents } from "./agent-run-log";

export function evidenceMarkdown(events: Awaited<ReturnType<typeof recentAgentEvents>>) {
  const lines = ["# Sarathi recorded evidence", "", `Exported: ${new Date().toISOString()}`, "", "Actual local trace, ordered by timestamp. UTC timestamps and India times are included. Identifiers and credentials are redacted; audio/PDF bytes are represented by size and hash. Scripted responses are labeled. These logs do not prove a provider booking. Export before the two-hour retention window expires.", "", "## Decisions in order", ""];
  events.filter(event => event.type === "decision").forEach((event, index) => {
    const details = event.details;
    const input = events.find(item => item.run_id === event.run_id && item.type === "user_input");
    const json = (value: unknown) => JSON.stringify(value ?? "Not captured", null, 2);
    lines.push(`### ${index + 1}. ${event.created_at}`, "", `India time: ${new Date(event.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`, "", `Run: ${event.run_id}`, "", `Received: ${json(details.input || input?.details)}`, "", `Connector/source: ${json({ connector: details.connector || input?.details.connector, source: details.source || input?.details.source })}`, "", `Decided: ${json(details.decided)}`, "", `Rule/reason: ${json(details.why)}`, "", `Actual message/action: ${json({ message: details.message, action: details.action || details.decided })}`, "", `Recipient/channel: ${json({ to: details.to, through: details.through })}`, "");
  });
  lines.push("## Partner requests and responses", "");
  for (const event of events.filter(event => ["tool_call", "tool_response"].includes(event.type) && event.details.endpoint)) lines.push(`### ${event.created_at} · ${event.type}`, "", "```json", JSON.stringify(event.details, null, 2), "```", "");
  lines.push("## Complete timeline", "", "```json", JSON.stringify(events, null, 2), "```", "");
  return lines.join("\n");
}
