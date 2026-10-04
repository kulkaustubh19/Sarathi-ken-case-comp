"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type Summary = { drive_warning?: string; user_name: string; generated_at: string; week: { start: string; end: string }; counts: { pending: number; appointments: number; tests: number; replenishments: number; documents: number; uploads: number; samples: number; shared_documents: number; invitations_received: number; invitations_sent: number; signatures_pending: number }; events: { id: string; title: string; description: string; starts_at: string; upcoming: boolean }[] };
const date = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
export function SummaryDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/dashboard", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load your overview."); setData(result); }
    catch (failure) { setData(null); setError((failure as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load(); const update = () => { void load(); };
    window.addEventListener("sarathi-data-updated", update);
    window.addEventListener("healthnest-auth-updated", update);
    window.addEventListener("focus", update);
    return () => { window.removeEventListener("sarathi-data-updated", update); window.removeEventListener("healthnest-auth-updated", update); window.removeEventListener("focus", update); };
  }, [load]);
  return <div className="repository-workspace"><div className="workspace-title"><div><p className="eyebrow">Sarathi · Across generations</p><h1>Your family care, at a glance</h1><p>Care reminders, your documents and invitations in one place.</p></div><button className="secondary-button" onClick={load} disabled={loading}>Refresh overview</button></div>
    {loading && <p role="status">Loading your overview…</p>}
    {error && <section className="workspace-card" role="alert"><h2>Sign in to see your summary</h2><p>{error}</p><p>Open Sarathi chat to log in, then refresh this overview.</p></section>}
    {data && <>{data.drive_warning && <p role="alert">{data.drive_warning}</p>}<section className="dashboard-week"><strong>{date(data.week.start)}–{date(new Date(Date.parse(data.week.end) - 1).toISOString())} · Current week (IST)</strong><p>{data.counts.pending ? `${data.counts.pending} upcoming care task${data.counts.pending === 1 ? "" : "s"} this week, including ${data.counts.appointments} appointment${data.counts.appointments === 1 ? "" : "s"}.` : "No upcoming tasks or appointments this week."}</p></section>
      <div className="dashboard-grid">
        <Link href="/tasks" className="workspace-card summary-tile"><span>Pending this week</span><strong>{data.counts.pending}</strong><small>Upcoming tasks and appointments</small></Link>
        <Link href="/tasks?focus=lab" className="workspace-card summary-tile"><span>Upcoming tests</span><strong>{data.counts.tests}</strong><small>Blood tests, lab tests and scans · this week</small></Link>
        <Link href="/tasks" className="workspace-card summary-tile"><span>Medicine replenishments</span><strong>{data.counts.replenishments}</strong><small>Medicine orders and refills · this week</small></Link>
        <Link href="/documents" className="workspace-card summary-tile"><span>Your documents</span><strong>{data.counts.documents}</strong><small>{data.counts.uploads} uploaded · {data.counts.samples} demo samples · {data.counts.shared_documents} shared documents available</small></Link>
        <Link href="/members" className="workspace-card summary-tile"><span>Invitations received</span><strong>{data.counts.invitations_received}</strong><small>Awaiting your acceptance</small></Link>
        <Link href="/members" className="workspace-card summary-tile"><span>Invitations awaiting acceptance</span><strong>{data.counts.invitations_sent}</strong><small>{data.counts.signatures_pending} sharing consent{data.counts.signatures_pending === 1 ? "" : "s"} awaiting signature</small></Link>
      </div><section className="workspace-card"><div className="card-title"><h2>This week’s reminders</h2><Link className="subtle-link" href="/tasks">View care tasks →</Link></div><p>Only Monday–Sunday events in IST are shown. Elapsed times do not prove a task was completed.</p>
        {data.events.length ? data.events.map(event => <article className="member-row" key={event.id}><div><strong>{event.title}</strong><p>{time(event.starts_at)} IST · {event.upcoming ? "Upcoming" : "Time elapsed"}</p><p>{event.description}</p></div></article>) : <p>No reminders scheduled this week.</p>}
      </section><p className="helper">Updated {time(data.generated_at)} IST. Document counts include your connected Drive when available. Care Tasks show Calendar links after confirmed sync; provider bookings remain simulated.</p></>}
  </div>;
}
