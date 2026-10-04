"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Task = { id: string; title: string; description: string; starts_at: string; url?: string; own?: boolean; calendar_status?: string };
function displayDate(value: string) { const date = new Date(value.length === 10 ? `${value}T00:00:00` : value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [focusLab, setFocusLab] = useState(false);
  const load = useCallback(() => { setLoading(true); setError(""); return fetch("/api/calendar/tasks", { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load your tasks."); setTasks(data.tasks || []); }).catch(failure => setError((failure as Error).message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { setFocusLab(new URLSearchParams(window.location.search).get("focus") === "lab"); void load(); }, [load]);
  const labTasks = useMemo(() => tasks.filter(task => /\b(blood|lab|test|scan|ct|cbc|lipid|glucose|pathology|sample collection)\b/i.test(`${task.title} ${task.description}`)), [tasks]);
  const visible = focusLab ? labTasks : tasks;
  return <div className="repository-workspace"><div className="workspace-title"><div><p className="eyebrow">Your reminders</p><h1>Tasks</h1><p>Upcoming reminders for the current Monday–Sunday week in IST, saved to this computer by Sarathi.</p></div><div className="inline-actions"><Link className="secondary-button" href="/documents">Manage documents</Link></div></div>
    <div className="prototype-note">Ask the chatbot to order medicines or schedule a blood test, lab test, CT scan, or follow-up. Provider booking is simulated. Connect Google from Documents to sync care tasks to your primary Calendar.</div>
    {loading && <p role="status">Loading local reminders…</p>}{error && <div className="workspace-error" role="alert">{error} <Link href="/documents">Manage documents</Link></div>}
    {!loading && <section className="workspace-card"><div className="card-title"><div><h2>{focusLab ? "Blood and lab test tasks" : "This week’s upcoming tasks"}</h2><p>{focusLab ? `${labTasks.length} matching task${labTasks.length === 1 ? "" : "s"}` : `${tasks.length} upcoming reminder${tasks.length === 1 ? "" : "s"}`}</p></div><button className="secondary-button" onClick={load}>Refresh</button></div>
      {visible.length ? <div>{visible.map(task => <article className="member-row" key={task.id}><div><strong>{task.title}</strong><p>{displayDate(task.starts_at)}</p>{task.description && <p>{task.description}</p>}</div>{task.own && !task.url && <button onClick={async () => { const response = await fetch("/api/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_id: task.id }) }); const result = await response.json(); if (!response.ok || !result.synced) setError(result.error || result.warning || "Calendar sync failed."); else void load(); }}>Sync to Google Calendar</button>}{task.url && <a className="subtle-link" href={task.url} target="_blank" rel="noopener noreferrer">Open in Calendar ↗</a>}</article>)}</div> : <p>{focusLab ? "No upcoming blood-test or lab reminders were found in local Tasks." : "No upcoming reminders this week."}</p>}</section>}
  </div>;
}
