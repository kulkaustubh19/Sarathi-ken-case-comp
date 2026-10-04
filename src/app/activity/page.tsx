"use client";

import { useCallback, useEffect, useState } from "react";

type Event = { id: string; run_id: string; created_at: string; expires_at: string; type: string; details: Record<string, unknown> };
export default function ActivityPage() {
  const [events, setEvents] = useState<Event[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const response = await fetch("/api/activity", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load activity."); setEvents(data.events || []); setError(""); }
    catch (failure) { setError((failure as Error).message); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);
  async function clear() { setBusy(true); setError(""); try { const response = await fetch("/api/activity", { method: "DELETE", cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not clear activity."); setEvents([]); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <div className="repository-workspace"><div className="workspace-title"><div><p className="eyebrow">Agent trace · local prototype</p><h1>Activity</h1><p>Inputs, model calls, integration responses, and messages sent by Sarathi. Entries expire automatically after two hours.</p></div><div className="inline-actions"><button className="secondary-button" onClick={() => void load()}>Refresh</button><a className="secondary-button" href="/api/activity?format=markdown">Export decisions</a><a className="secondary-button" href="/api/activity?format=json">Export JSON</a><button className="secondary-button" disabled={busy || events.length === 0} onClick={clear}>Clear log</button></div></div>
    <div className="prototype-note">This local demo log redacts common identifiers and never records API secrets, access tokens, or original document bytes. Review it before recording your demo. Configured Gnani and Delhivery calls are recorded with their exact endpoint, request fields and response. Simulations are labeled; audio and PDF bytes are omitted. Export before the two-hour cleanup.</div>
    {error && <div className="workspace-error" role="alert">{error}</div>}
    {!events.length && !error && <section className="workspace-card"><h2>No activity yet</h2><p>Chat with Sarathi, prepare a visit brief, or upload a supported report to see each step recorded here.</p></section>}
    {events.map(event => <section className="workspace-card" key={event.id}><div className="card-title"><div><p className="eyebrow">{event.type.replaceAll("_", " ")}</p><h2>{String(event.details.provider || event.details.operation || event.details.message || event.type)}</h2></div><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div><p>Run {event.run_id.split(":").at(-1)?.slice(0, 8)} · expires {new Date(event.expires_at).toLocaleTimeString()}</p><pre className="activity-details">{JSON.stringify(event.details, null, 2)}</pre></section>)}
  </div>;
}
