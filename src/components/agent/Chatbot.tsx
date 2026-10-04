"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STORAGE_CONSENT } from "@/lib/documents";

type User = { id: string; mobile_number: string; email: string; user_name?: string };
type Tile = { path: string; label: string; detail?: string };
type Message = { role: "assistant" | "user"; text: string; tiles?: Tile[] };
type Stage = "loading" | "choice" | "name" | "phone" | "email" | "profile" | "login-consent" | "otp" | "ready";
const greeting = "Welcome to Sarathi — your family care companion, across generations. Please log in to get started, or sign up if you’re new here.";

async function api(url: string, body?: object) {
  const response = await fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Please try again."), { status: response.status });
  return data;
}

export function Chatbot() {
  const [open, setOpen] = useState(true);
  const [stage, setStage] = useState<Stage>("loading");
  const [mode, setMode] = useState<"signup" | "login">("login");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [folderLink, setFolderLink] = useState("");
  const [terms, setTerms] = useState(false);
  const [otp, setOtp] = useState("123456");
  const [user, setUser] = useState<User | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: greeting }]);
  const [visitConsent, setVisitConsent] = useState<string | null>(null);
  const [suggestedAction, setSuggestedAction] = useState<{ path: string; label: string } | null>(null);
  const [memberIntent, setMemberIntent] = useState<string | null>(null);
  const router = useRouter();
  const notified = useRef(new Set<string>());
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const add = (role: Message["role"], text: string) => setMessages(previous => [...previous, { role, text }]);
  useEffect(() => { if (stage === "ready" || stage === "choice") window.dispatchEvent(new Event("sarathi-data-updated")); }, [stage, user?.id]);

  useEffect(() => {
    let active = true;
    api("/api/auth").then(data => {
      if (!active) return;
      setOtp(data.otp);
      setUser(data.user);
      setStage(data.user ? "ready" : "choice");
      if (data.user) setMessages([{ role: "assistant", text: "Welcome back. Tell me what you need in your own words. I can check your records, help with family access, or find existing care tasks." }]);
    }).catch(err => { if (active) { setError(err.message); setStage("choice"); } });
    return () => { active = false; };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy, error, open]);
  useEffect(() => { if (open && !busy) inputRef.current?.focus(); }, [stage, open, busy]);

  useEffect(() => {
    function onAgentUpdate(event: Event) {
      const detail = (event as CustomEvent<{ message: string; user_id?: string; booking_id?: string; state?: string }>).detail;
      if (stage !== "ready" || !user || detail.user_id !== user.id || typeof detail.message !== "string") return;
      const key = detail.booking_id ? `${detail.booking_id}:${detail.state}` : "";
      if (key && notified.current.has(key)) return;
      if (key) notified.current.add(key);
      if (detail.booking_id && detail.state === "completed") window.dispatchEvent(new Event("sarathi-data-updated"));
      setMessages(previous => [...previous, { role: "assistant", text: detail.message }]); setOpen(true); setBusy(false);
    }
    window.addEventListener("healthnest-agent-update", onAgentUpdate);
    return () => window.removeEventListener("healthnest-agent-update", onAgentUpdate);
  }, [stage, user]);

  function choose(next: "signup" | "login") {
    setMemberIntent(null); setMode(next); setStage(next === "signup" ? "name" : "phone"); setError(""); setInput(""); setEmail(""); setPhone(""); setName(""); setFolderLink(""); setTerms(false);
    add("user", next === "signup" ? "Sign up" : "Log in");
    add("assistant", next === "signup" ? "What’s your name? We’ll use it when you upload documents for yourself." : "What’s your mobile number? Enter 10 Indian digits or include your country code, such as +91.");
  }
  async function requestCode(nextPhone = phone, nextEmail = email) {
    if (!terms) throw new Error("Accept the Sarathi session and privacy terms to continue.");
    const data = await api("/api/auth", { action: "request-otp", mode, phone: nextPhone, email: nextEmail, user_name: name, drive_folder_url: folderLink, storage_consent: terms });
    setPhone(data.phone); setOtp(data.otp); setStage("otp");
    add("assistant", `Enter the prototype OTP ${data.otp}. No SMS is sent. This request expires in 5 minutes.`);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const value = input.trim();
    setError(""); setBusy(true);
    try {
      if (stage === "name") {
        if (value.length > 100) throw new Error("Please enter a name of up to 100 characters.");
        setName(value); add("user", value); setStage("phone"); setInput("");
        add("assistant", "What’s your mobile number? Enter 10 Indian digits or include your country code, such as +91.");
      } else if (stage === "phone") {
        const cleaned = value.replace(/[\s()-]/g, "");
        const normalized = /^\d{10}$/.test(cleaned) ? `+91${cleaned}` : cleaned;
        if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Please enter a valid mobile number with country code.");
        add("user", value);
        if (mode === "login") { setPhone(normalized); setTerms(false); setStage("login-consent"); add("assistant", "Before I send your prototype OTP, please review and accept the session and privacy terms below."); }
        else { setPhone(normalized); setStage("email"); add("assistant", "What’s your email address? It will be saved with your mobile number."); }
        setInput("");
      } else if (stage === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Please enter a valid email address.");
        add("user", value);
        setEmail(value); setStage("profile"); setInput("");
        add("assistant", "You can provide a private Google Drive folder link, or leave it blank for a new Sarathi folder. Please review the storage terms. After login, connect Google to create your repository.");
      } else if (stage === "otp") {
        const data = await api("/api/auth", { action: "verify-otp", otp: value });
        add("user", "••••••"); setInput("");
        if (data.registered) {
          setStage("choice"); add("assistant", "Your account has been created. Choose Log in and enter your mobile number and prototype OTP to continue.");
        } else {
          setUser(data.user); setStage("ready"); add("assistant", `You’re logged in${data.user.user_name ? `, ${data.user.user_name}` : ""}. Tell me what you need in your own words. I can check records, help with family access, or find existing care tasks.`);
        }
      } else if (stage === "ready") {
        setSuggestedAction(null);
        if (/\b(prepare|prep|summary|summarize|summarise|review|go through)\b/i.test(value) && /\b(doctor|visit|appointment)\b/i.test(value)) {
          add("user", value); setInput(""); setVisitConsent(value);
          add("assistant", "I’ll extract accessible records locally, then attempt to redact names, contact details, dates of birth, and record identifiers before sending de-identified text to Groq. Age and sex may remain. The local activity trace expires after two hours. Continue?");
          return;
        }
        const data = await api("/api/chat", { message: value, member_intent: memberIntent });
        setMemberIntent(data.member_intent || null);
        const allowed = ["/", "/members", "/documents", "/tasks", "/voice", "/location", "/address-book"];
        const tiles = Array.isArray(data.tiles) ? data.tiles.filter((tile: Tile) => typeof tile.path === "string" && allowed.includes(tile.path.split("?")[0])).slice(0,4) : data.action && allowed.includes(data.action.path?.split("?")[0]) ? [{ path: data.action.path, label: data.action.label }] : [];
        setMessages(previous => [...previous, { role: "user", text: value }, { role: "assistant", text: data.reply, tiles }]); setInput("");
        if (data.action && typeof data.action.path === "string" && allowed.includes(data.action.path.split("?")[0])) {
          if (data.action.type === "navigate") router.push(data.action.path);
          else if (data.action.type === "suggest_invite") setSuggestedAction({ path: data.action.path, label: data.action.label || "Invite a family member" });
        }
      }
    } catch (err) {
      setError((err as Error).message);
      if ((err as { status?: number }).status === 401 && stage === "ready") { setMemberIntent(null); setUser(null); setStage("choice"); setVisitConsent(null); setMessages([{ role: "assistant", text: greeting }]); }
    } finally { setBusy(false); }
  }
  async function confirmVisit() {
    if (!visitConsent || busy) return;
    setBusy(true); setError("");
    try {
      const data = await api("/api/chat", { message: visitConsent, prepare_visit: true });
      const sources = Array.isArray(data.sources) && data.sources.length ? `\n\nRecords reviewed: ${data.sources.map((source: { type: string; date: string }) => `${source.type} (${source.date})`).join("; ")}` : "";
      add("assistant", `${data.reply}${sources}`); setVisitConsent(null);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try {
      await api("/api/auth", { action: "logout" });
      setMemberIntent(null); setUser(null); setStage("choice"); setInput(""); setVisitConsent(null); setMessages([{ role: "assistant", text: greeting }]);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const canType = ["name", "phone", "email", "otp", "ready"].includes(stage);
  const label = stage === "name" ? "Your name" : stage === "phone" ? "Mobile number" : stage === "email" ? "Email address" : stage === "otp" ? "Prototype OTP" : memberIntent ? "Member’s name or email" : "Message Sarathi";

  return <>
    {!open && <button className="chat-launcher" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="care-chat">Chat with Sarathi</button>}
    {open && <section className="chat-window" data-stage={stage} id="care-chat" aria-label="Sarathi chatbot">
      <header className="chat-heading">
        <div><span className="chat-symbol" aria-hidden="true">✦</span><div><h2>Sarathi</h2><p>Your family care companion · Across generations</p></div></div>
        <button onClick={() => setOpen(false)} aria-label="Minimize chat">−</button>
      </header>
      <div className="chat-prototype">Prototype · fixed OTP {otp} · no SMS</div>
      <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((message, index) => <div key={index} className={`chat-bubble ${message.role}`}><div>{message.text}</div>{message.tiles?.length ? <div className="chat-action-tiles">{message.tiles.map(tile => <button key={tile.path} disabled={busy} onClick={() => router.push(tile.path)}><strong>{tile.label} <span aria-hidden="true">↗</span></strong>{tile.detail && <small>{tile.detail}</small>}</button>)}</div> : null}</div>)}
        {stage === "loading" && <p className="chat-status">Checking your session…</p>}
        {busy && <p className="chat-status">One moment…</p>}
        <div ref={bottom} />
      </div>
      {error && <p className="chat-error" role="alert">{error}</p>}
      {stage === "choice" && <div className="chat-actions"><button disabled={busy} onClick={() => choose("login")}>Log in</button><button disabled={busy} onClick={() => choose("signup")}>Sign up</button></div>}
      {visitConsent && <div className="chat-actions"><button disabled={busy} onClick={confirmVisit}>{busy ? "Preparing…" : "Prepare visit brief"}</button><button disabled={busy} onClick={() => { setVisitConsent(null); add("assistant", "Okay, I won’t read any records."); }}>Cancel</button></div>}
      {suggestedAction && <div className="chat-actions"><button disabled={busy} onClick={() => router.push(suggestedAction.path)}>{suggestedAction.label}</button><button disabled={busy} onClick={() => { setSuggestedAction(null); add("assistant", "Okay. You can invite them later from Add/Remove members."); }}>Not now</button></div>}
      {stage === "profile" && <form className="chat-profile" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await requestCode(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
        <label>Google Drive folder link (optional)<input type="url" value={folderLink} onChange={event => { setFolderLink(event.target.value); setTerms(false); }} placeholder="Leave blank to create a folder" disabled={busy} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} required disabled={busy} /><span>{STORAGE_CONSENT}</span></label>
        <button className="primary-button" disabled={busy || !terms}>Continue to prototype OTP</button>
      </form>}
      {stage === "login-consent" && <form className="chat-profile" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await requestCode(phone); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
        <label className="checkbox-label"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} required disabled={busy} /><span>{STORAGE_CONSENT}</span></label>
        <button className="primary-button" disabled={busy || !terms}>Accept &amp; send prototype OTP</button>
      </form>}
      {canType && <form className="chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-input">{label}</label>
        <input ref={inputRef} id="chat-input" type={stage === "email" ? "email" : stage === "phone" ? "tel" : "text"} inputMode={stage === "otp" ? "numeric" : undefined} autoComplete={stage === "phone" ? "tel" : stage === "email" ? "email" : stage === "otp" ? "one-time-code" : "off"} placeholder={label} value={input} onChange={event => setInput(event.target.value)} disabled={busy || Boolean(visitConsent)} maxLength={stage === "ready" ? 1000 : 254} required />
        <button disabled={busy || Boolean(visitConsent) || !input.trim()} type="submit">{stage === "otp" ? "Verify" : "Send"}</button>
      </form>}
      <footer className="chat-footer">
        {user ? <><span>Logged in · {user.mobile_number}</span><button disabled={busy} onClick={() => { setVisitConsent(null); setMessages([{ role: "assistant", text: "Chat cleared. Visit brief text existed only in this browser session." }]); }}>Clear chat</button><button disabled={busy} onClick={logout}>Log out</button></> : <>
          <span>Use sample details for this prototype.</span>
          {stage === "otp" ? <button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await requestCode(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>New code</button> : null}
          {canType && <button disabled={busy} onClick={() => { setStage("choice"); setInput(""); setError(""); }}>Start over</button>}
        </>}
      </footer>
    </section>}
  </>;
}
