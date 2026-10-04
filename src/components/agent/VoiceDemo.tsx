"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { LabInquiryResult, PharmacyInquiryResult, TranscriptTurn } from "@/lib/types";

type DemoResponse = { booking?: { id: string; event_id: string; reply: string; user_id: string }; turns: TranscriptTurn[]; result: LabInquiryResult | PharmacyInquiryResult; activity: Array<{ id: string; message: string }> };
type TrialCall = { id: string; status: string; transcript?: string; result?: LabInquiryResult | PharmacyInquiryResult; activity: Array<{ id: string; message: string }> };

export function VoiceDemo({ hosted = false }: { hosted?: boolean }) {
  const params = useSearchParams();
  const requestedBooking = params.get("booking");
  const activeBooking = useRef<string | null>(null);
  const [useCase, setUseCase] = useState<"lab_inquiry" | "pharmacy_inquiry">("lab_inquiry");
  const [item, setItem] = useState("Complete blood count");
  const [data, setData] = useState<DemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [trialCall, setTrialCall] = useState<TrialCall | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingLab, setBookingLab] = useState<string | null>(null);
  const autoStarted = useRef<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (pollTimer.current !== null) window.clearTimeout(pollTimer.current); }; }, []);

  const label = useCase === "lab_inquiry" ? "Test name" : "Medicine name";
  async function startCall(flowId: string | null = bookingId) {
    setIsRunning(true); setError(null); setData(null);
    const body = flowId ? { booking_id: flowId } : useCase === "lab_inquiry" ? { useCase, testName: item } : { useCase, medicineName: item };
    try {
      const response = await fetch("/api/gnani/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as DemoResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to run the voice inquiry.");
      if (mounted.current && (!flowId || activeBooking.current === flowId)) setData(payload);
      if (payload.booking) window.dispatchEvent(new CustomEvent("healthnest-agent-update", { detail: { message: payload.booking.reply, user_id: payload.booking.user_id, booking_id: payload.booking.id, state: "completed" } }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to run the voice inquiry.";
      if (mounted.current && (!flowId || activeBooking.current === flowId)) setError(message);
      if (flowId) { const auth = await fetch("/api/auth", { cache: "no-store" }).then(response => response.json()).catch(() => null); window.dispatchEvent(new CustomEvent("healthnest-agent-update", { detail: { message: `The booking simulation could not finish: ${message} No booking was confirmed. Use Retry simulation on Voice inquiries.`, user_id: auth?.user?.id, booking_id: flowId, state: "failed" } })); }
    }
    finally { if (mounted.current && (!flowId || activeBooking.current === flowId)) setIsRunning(false); }
  }

  useEffect(() => {
    const id = requestedBooking; activeBooking.current = id;
    if (!id) { autoStarted.current = null; setBookingId(null); setData(null); setBookingLab(null); setIsRunning(false); return; }
    if (autoStarted.current === id) return;
    autoStarted.current = id; setBookingId(id); setIsRunning(true);
    fetch(`/api/booking?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then(async response => {
      const setup = await response.json(); if (!response.ok) throw new Error(setup.error || "Could not load booking setup.");
      if (mounted.current && activeBooking.current === id) { setUseCase(setup.input.useCase); setItem(setup.input.testName || setup.input.medicineName); setBookingLab(setup.lab_name || null); }
      await startCall(id);
    }).catch(failure => { if (mounted.current && activeBooking.current === id) { setError(failure.message); setIsRunning(false); } });
    // URL booking ID is a server-owned request. Auto-run once per mount; server coalesces retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedBooking]);

  async function startRealCall() {
    setIsRunning(true); setError(null); setTrialCall(null);
    const body = useCase === "lab_inquiry" ? { useCase, testName: item } : { useCase, medicineName: item };
    try {
      const response = await fetch("/api/twilio/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "Unable to start the Twilio Trial call.");
      const poll = async () => {
        try {
          const response = await fetch(`/api/twilio/calls/${payload.id}`, { cache: "no-store" });
          const status = await response.json() as TrialCall & { error?: string };
          if (!response.ok) throw new Error(status.error || "Could not read call status.");
          if (!mounted.current) return;
          setTrialCall(status);
          if (status.status === "in_progress") pollTimer.current = window.setTimeout(poll, 2500);
        } catch (failure) { if (mounted.current) { setError(failure instanceof Error ? failure.message : "Could not read call status."); setTrialCall(null); } }
      };
      await poll();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to start the trial call."); }
    finally { setIsRunning(false); }
  }

  return <div className="voice-demo">
    <section className="voice-card voice-intro">
      <p className="eyebrow">Gnani voice rail</p>
      <h1>Run a simulated voice inquiry</h1>
      <p>The agent uses a disclosed catalog voice. The lab or pharmacy reply is scripted audio and passes through Gnani speech-to-text before structured details are shown.</p>
    </section>
    {bookingId && <section className="voice-card"><h2>{bookingLab ? `Booking with ${bookingLab}` : "Your demo booking"}</h2><p>{isRunning ? "Sarathi is running the in-app voice simulation. Your care task will be added only after availability is confirmed." : data?.booking ? data.booking.reply : "Retry the simulation to finish your booking."}</p><Link className="subtle-link" href="/tasks">View Care Tasks</Link></section>}
    <section className="voice-card voice-form" aria-label="Voice inquiry setup">
      <div className="choice-row">
        <button className={useCase === "lab_inquiry" ? "choice active" : "choice"} disabled={isRunning || Boolean(bookingId)} onClick={() => { setUseCase("lab_inquiry"); setItem("Complete blood count"); }}>Lab inquiry</button>
        <button className={useCase === "pharmacy_inquiry" ? "choice active" : "choice"} disabled={isRunning || Boolean(bookingId)} onClick={() => { setUseCase("pharmacy_inquiry"); setItem("Metformin 500 mg"); }}>Pharmacy inquiry</button>
      </div>
      <label>{label}<input disabled={isRunning || Boolean(bookingId)} value={item} onChange={(event) => setItem(event.target.value)} maxLength={80} /></label>
      <div className="call-actions"><button className="run-call" disabled={Boolean(data?.booking) || isRunning || trialCall?.status === "in_progress" || !item.trim()} onClick={() => void startCall()}>{isRunning ? "Running simulation…" : bookingId ? "Retry simulation" : "Start in-app simulation"}</button>{!hosted && <button className="trial-call" disabled={Boolean(bookingId) || isRunning || trialCall?.status === "in_progress" || !item.trim()} onClick={startRealCall}>Call verified demo operator</button>}</div>
      <p className="helper">{hosted ? "Use the in-app Gnani simulation for this hosted prototype. Phone calls are available in the local demo." : "The trial call reaches only the configured verified teammate. Gnani provides the prompt audio; Twilio Trial transcribes the reply. No real institution is contacted."}</p>
    </section>
    {error && <section className="voice-card voice-error" role="alert"><strong>Call needs attention</strong><p>{error}</p></section>}
    {data && <div className="voice-results">
      <section className="voice-card"><h2>Call transcript</h2>{data.turns.map((turn) => <article className={`turn ${turn.speaker}`} key={turn.id}><span>{turn.speaker === "assistant" ? "Sarathi" : "Lab / pharmacy"}</span><p>{turn.text}</p>{turn.audioDataUri && <audio controls src={turn.audioDataUri}>Audio playback is unavailable.</audio>}</article>)}</section>
      <section className="voice-card"><h2>Structured result</h2><dl>{Object.entries(data.result).filter(([key]) => key !== "needsConfirmation").map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value === undefined ? "Not captured" : String(value)}</dd></div>)}</dl>{data.result.needsConfirmation.length > 0 && <p className="confirmation">Needs confirmation: {data.result.needsConfirmation.join(", ")}</p>}</section>
      <section className="voice-card"><h2>Activity</h2>{data.activity.map((event) => <p className="activity-item" key={event.id}>{event.message}</p>)}</section>
    </div>}
    {trialCall && <div className="voice-results"><section className="voice-card"><p className="eyebrow">Twilio Trial call</p><h2>Status: {trialCall.status.replace(/_/g, " ")}</h2>{trialCall.transcript && <><h3>Twilio Trial speech reply</h3><p>{trialCall.transcript}</p></>}{trialCall.result && <dl>{Object.entries(trialCall.result).filter(([key]) => key !== "needsConfirmation").map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value === undefined ? "Not captured" : String(value)}</dd></div>)}</dl>}</section><section className="voice-card"><h2>Activity</h2>{trialCall.activity.map((event) => <p className="activity-item" key={event.id}>{event.message}</p>)}</section></div>}
  </div>;
}
