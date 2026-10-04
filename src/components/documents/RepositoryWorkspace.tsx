"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DOCUMENT_LABELS, DOCUMENT_TYPES, STORAGE_CONSENT, sharingConsent, type AccessGrant, type HealthDocument } from "@/lib/documents";

type Profile = { hosted: boolean; max_upload_mb: number; user: { id: string; user_name?: string; drive_folder_url?: string; storage_consent_at?: string; storage_consent_version?: string }; drive: { connected: boolean; google_email?: string; calendar_sync?: boolean }; google_configured: boolean; consent_mode: string };
type Summary = { owner_id: string; name: string; own: boolean; counts: Record<string, number>; total: number; folder_links: Record<string, { label: string; url: string }[]> };
type DocumentRow = Omit<HealthDocument, "drive_file_id"> & { drive_url: string };
type FollowupReview = { follow_ups: { task: string; due_date: string | null; lab_name: string | null; source_excerpt: string }[]; medicines: { name: string; instructions_exactly_as_written: string; start_date: string | null; end_date: string | null; times: string[] }[]; source_file: string; patient: string; temporary: true };
type MemberData = { outgoing: Omit<AccessGrant, "drive_permission_id">[]; incoming: { id: string; owner_name: string; status: string }[]; google_connected: boolean; consent_mode: string };

async function request<T>(url: string, body?: object | FormData): Promise<T> {
  const response = await fetch(url, { method: body ? "POST" : "GET", headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function RepositoryWorkspace({ section = "documents" }: { section?: "documents" | "members" }) {
  const query = useSearchParams();
  const [memberName, setMemberName] = useState("");
  const [storage, setStorage] = useState("local");
  const [calendarSync, setCalendarSync] = useState(true);
  const [googleConsent, setGoogleConsent] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [folderLink, setFolderLink] = useState("");
  const [terms, setTerms] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"browse" | "upload">("browse");
  const [file, setFile] = useState<File | null>(null);
  const [patient, setPatient] = useState("me");
  const [type, setType] = useState<string>(DOCUMENT_TYPES[0]);
  const [docs, setDocs] = useState<{ summary: Summary[]; documents: DocumentRow[]; limit: number }>({ summary: [], documents: [], limit: 1000 });
  const [ownerFilter, setOwnerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [patientFilter, setPatientFilter] = useState("");
  const [followupReview, setFollowupReview] = useState<FollowupReview | null>(null);
  const [followupExpiresAt, setFollowupExpiresAt] = useState<number | null>(null);
  const [calendarDates, setCalendarDates] = useState<Record<string, string>>({});
  const [calendarUrl, setCalendarUrl] = useState("");
  const [members, setMembers] = useState<MemberData | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{ filename: string; preview_url: string } | null>(null);
  const load = useCallback(async () => {
    const data = await request<Profile>("/api/profile");
    setProfile(data); setName(data.user.user_name || ""); setFolderLink(data.user.drive_folder_url || ""); setTerms(Boolean(data.user.storage_consent_at));
    if (section === "documents") setDocs(await request(`/api/documents?storage=${storage}`));
    else setMembers(await request("/api/members"));
  }, [section, storage]);
  useEffect(() => {
    setTab(query.get("tab") === "upload" ? "upload" : "browse");
    if (section === "members") { setAdding(query.get("focus") === "add"); setMemberName(query.get("member_name") || ""); if (query.get("member_name")?.includes("@")) setEmail(query.get("member_name")!); }
    setOwnerFilter(query.get("owner") || ""); setTypeFilter(query.get("type") || ""); setPatientFilter(query.get("patient") || "");
    if (query.get("error")) setError(query.get("error")!);
    if (query.get("connected")) setNotice("Google authorization completed for this session. Check the connection panel for Calendar permission and select Google Drive documents to scan folders.");
    load().catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [load, query, section]);
  useEffect(() => {
    if (!preview) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [preview]);
  useEffect(() => {
    if (!followupReview || !followupExpiresAt) return;
    const timer = window.setTimeout(() => { setFollowupReview(null); setFollowupExpiresAt(null); setCalendarDates({}); setNotice("Temporary follow-up suggestions were cleared after two hours. Your saved local task events remain in Tasks."); }, Math.max(0, followupExpiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [followupReview, followupExpiresAt]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await request("/api/profile", { user_name: name, drive_folder_url: folderLink, storage_consent: terms });
      await load(); setEditing(false); setNotice("Profile saved. Documents and reminders stay on this computer for the prototype.");
    });
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!file) return;
    data.set("file", file); data.set("storage", storage);
    await run(async () => {
      const uploaded = await request<{ repository_path: string; storage: string; calendar_event?: { title: string; starts_at: string; synced: boolean; warning?: string } | null }>("/api/documents", data);
      await load(); setFollowupReview(null); setFollowupExpiresAt(null); setFile(null); setTab("browse"); setNotice(uploaded.calendar_event ? `Saved to ${uploaded.storage === "drive" ? "Google Drive" : profile?.hosted ? "private demo storage" : "this computer"}: ${uploaded.repository_path}. Added “${uploaded.calendar_event.title}” to Care Tasks. ${uploaded.calendar_event.synced ? "Synced to Google Calendar." : uploaded.calendar_event.warning}` : `Saved to ${uploaded.storage}: ${uploaded.repository_path}`);
    });
  }
  async function syncCalendar(title: string, date: string, description: string, options: { type?: "medicine"; time?: string; repeatUntil?: string } = {}) {
    await run(async () => {
      const result = await request<{ url: string }>("/api/calendar/events", { confirmed: true, title, date, description, type: options.type || "follow_up", time: options.time, repeat_until: options.repeatUntil });
      setCalendarUrl(result.url || ""); setNotice("Added the confirmed reminder to local Tasks.");
    });
  }
  async function memberAction(action: string, id?: string) {
    await run(async () => {
      const result = await request<{ pending_signature?: boolean; email_status?: string; local_only?: boolean }>("/api/members", { action, id, email, member_name: memberName, consent: sharing }).catch(async failure => { await load(); throw failure; });
      await load();
      if (action === "add") { setAdding(false); setEmail(""); setSharing(false); }
      window.dispatchEvent(new Event("sarathi-data-updated"));
      const emailNotice = result.email_status === "sent" ? "Email notification sent." : result.email_status === "failed" ? "Email failed; retry in Members." : "Email not sent; check the sender configuration.";
      setNotice(result.pending_signature ? "Consent awaits your Setu eSignature; no access is granted yet. Check the email status below, then Sign consent and Check signature." : action === "add" || action === "check-consent" ? "Consent recorded. The invitation awaits the recipient’s acceptance in Sarathi. " + emailNotice : action === "accept" ? "Invitation accepted. You can now view this repository." : "Access updated. " + emailNotice);
    });
  }
  const maxMb = profile?.max_upload_mb || 25;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const needsProfile = profile && (!profile.user.user_name || !profile.user.storage_consent_at || profile.user.storage_consent_version !== "healthnest-local-v1");
  const filtered = docs.documents.filter(doc => (!ownerFilter || doc.owner_id === ownerFilter) && (!typeFilter || doc.document_type === typeFilter) && (!patientFilter || doc.patient_name.toLocaleLowerCase() === patientFilter.toLocaleLowerCase()));

  return <div className="repository-workspace">
    <div className="workspace-title"><div><p className="eyebrow">Sarathi · Across generations</p><h1>{section === "documents" ? "Your family’s health library" : "Your trusted circle"}</h1><p>{section === "documents" ? "Keep each patient’s records together, year after year." : "Choose who can view your repository, and see who has shared theirs with you."}</p></div><Link className="subtle-link" href={section === "documents" ? "/members" : "/documents"}>{section === "documents" ? "Manage members →" : "View documents →"}</Link></div>
    <div className="prototype-note">Prototype with a fixed OTP. Sample people and records are fictional. Choose demo storage or authorize Google Drive for this ten-minute session. Do not use real health records.</div>
    {loading && <p role="status">Loading your repository…</p>}
    {error && <div className="workspace-error" role="alert">{error}<button onClick={() => run(load)} disabled={busy}>Retry</button></div>}
    {notice && <div className="workspace-notice" role="status">{notice}{calendarUrl && <> <a href={calendarUrl} target="_blank" rel="noopener noreferrer">Open event ↗</a></>}</div>}
    {!loading && !profile && <div className="workspace-card"><h2>Log in to continue</h2><p>Use the Sarathi chat to log in or create your account, then refresh this page.</p><button onClick={() => run(load)}>Check login</button></div>}
    {profile && <>
      <section className="workspace-card repository-connection">
        <div><h2>Document storage & Calendar</h2><p>{profile.hosted ? "Hosted demo files and care tasks are stored privately in Supabase." : "Local uploads and care tasks stay on this computer."} Drive uploads go to your Google repository without saving a demo-storage copy. Calendar sync is optional.</p></div>
        {!needsProfile && !editing && <div className="inline-actions"><span className="status-chip">Demo storage ready</span><button className="secondary-button" onClick={() => setEditing(true)}>Profile & terms</button></div>}
        {(needsProfile || editing) && <form className="workspace-form" onSubmit={saveProfile}>
          <label>Your name<input value={name} onChange={event => setName(event.target.value)} required maxLength={100} autoComplete="name" /></label>
          <label>Google Drive base folder link (optional)<input type="url" value={folderLink} onChange={event => setFolderLink(event.target.value)} placeholder="https://drive.google.com/drive/folders/…" /></label>
          <label className="checkbox-label"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} required /><span>{STORAGE_CONSENT}</span></label>
          <button className="primary-button" disabled={busy || !terms}>Save profile & consent</button>
        </form>}
      </section>
      <section className="workspace-card"><h2>Google connection</h2>{profile.drive.connected ? <><p>Connected as {profile.drive.google_email}. Calendar sync: {profile.drive.calendar_sync ? "enabled" : "off"}. Access expires with your ten-minute session.</p><button disabled={busy} onClick={() => run(async () => { await request("/api/google/disconnect", {}); setStorage("local"); window.location.reload(); })}>Disconnect Google</button></> : <><p>Authorize your Google account to create/use a Sarathi folder and read or upload records. Google permissions expire in Sarathi with this login session; no refresh token or document copy is saved.</p><label className="checkbox-label"><input type="checkbox" checked={calendarSync} onChange={event => setCalendarSync(event.target.checked)} />Sync new care tasks to my primary Google Calendar. Event titles, descriptions and times will be shared with Google.</label><label className="checkbox-label"><input type="checkbox" checked={googleConsent} onChange={event => setGoogleConsent(event.target.checked)} />I authorize Drive access for this session and the selected Calendar option.</label><button className="primary-button" disabled={!googleConsent || !profile.google_configured || busy} onClick={() => { window.location.href = `/api/google/connect${calendarSync ? "?calendar=1" : ""}`; }}>Connect Google</button>{!profile.google_configured && <p>The app owner must configure Google OAuth credentials.</p>}</>}</section>
      {section === "documents" ? <>
        <div className="workspace-tabs"><button aria-pressed={storage === "local"} onClick={() => setStorage("local")}>{profile.hosted ? "Demo documents" : "Local documents"}</button><button aria-pressed={storage === "drive"} disabled={!profile.drive.connected} onClick={() => setStorage("drive")}>Google Drive documents</button></div>
        <div className="workspace-tabs"><button aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Check your documents</button><button aria-pressed={tab === "upload"} onClick={() => setTab("upload")}>＋ Upload document</button></div>
        {followupReview && tab === "browse" && <section className="workspace-card"><h2>Suggested follow-ups from {followupReview.source_file}</h2><p>Suggestions come only from text found in the uploaded file. Check the original document and confirm before adding a local task. Sarathi clears these temporary suggestions and their local activity trace after two hours; saved local task events remain in Tasks.</p>
          {followupReview.follow_ups.map((item, index) => { const key = `follow-${index}`; return <div className="member-row" key={key}><div><strong>{item.task}</strong><p>{item.source_excerpt || "Found in the uploaded document."}</p><p>Lab: {item.lab_name || "[Lab name]"}</p></div><div className="member-controls"><label>Date<input type="date" value={calendarDates[key] ?? item.due_date ?? ""} onChange={event => setCalendarDates(previous => ({ ...previous, [key]: event.target.value }))} /></label><button disabled={busy || !(calendarDates[key] ?? item.due_date)} onClick={() => syncCalendar(item.task, calendarDates[key] ?? item.due_date ?? "", `Patient: ${followupReview.patient}\nSource: ${followupReview.source_file}\n${item.lab_name ? `Lab: ${item.lab_name}` : "Lab: [Lab name]"}\nExtracted note: ${item.source_excerpt || ""}\nPlease confirm this follow-up with your clinician.`)}>Add reminder</button></div></div>; })}
          {followupReview.medicines.map((item, index) => { const key = `medicine-${index}`; return <div className="member-row" key={key}><div><strong>{item.name}</strong><p>Prescription: {item.instructions_exactly_as_written}</p><p>Source: {followupReview.source_file}</p></div><div className="member-controls"><label>Start date<input type="date" value={calendarDates[key] ?? item.start_date ?? ""} onChange={event => setCalendarDates(previous => ({ ...previous, [key]: event.target.value }))} /></label>{item.times?.length ? item.times.map(time => <button key={time} disabled={busy || !(calendarDates[key] ?? item.start_date)} onClick={() => syncCalendar(`Medicine reminder: ${item.name}`, calendarDates[key] ?? item.start_date ?? "", `Use only as prescribed. Directions in source: ${item.instructions_exactly_as_written}\nSource: ${followupReview.source_file}\nCheck the original prescription.`, { type: "medicine", time, repeatUntil: item.end_date || undefined })}>Add {time} reminder</button>) : <p>Exact times weren’t stated, so no alarm was generated. Choose times from the prescription before setting reminders.</p>}</div></div>; })}
          {!followupReview.follow_ups.length && !followupReview.medicines.length && <p>No explicit follow-up or medicine schedule was detected.</p>}
          <button className="secondary-button" onClick={() => { setFollowupReview(null); setFollowupExpiresAt(null); setCalendarDates({}); }}>Dismiss suggestions</button>
        </section>}
        {tab === "upload" ? <section className="workspace-card"><h2>Upload a document</h2><p>Any file format, up to {maxMb} MB. Destination: {storage === "drive" ? "Google Drive" : profile.hosted ? "private Supabase demo storage" : "this computer"}.</p>
          <form className="workspace-form" onSubmit={upload}>
            <label className="upload-zone">Choose your document<input type="file" required disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} />{file && <span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}</label>
            {file && <><div className="form-grid"><label>Type of document<select name="document_type" value={type} onChange={event => setType(event.target.value)}>{DOCUMENT_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Patient<select name="patient_choice" value={patient} onChange={event => setPatient(event.target.value)}><option value="me">Me — {profile.user.user_name}</option><option value="other">Others</option></select></label>
              {patient === "other" && <label>Patient name<input name="patient_name" maxLength={100} required /></label>}
              <label>Doctor name<input name="doctor_name" maxLength={100} required /></label><label>Document date<input name="document_date" type="date" defaultValue={today} required /></label><label>City <span>(optional)</span><input name="city" maxLength={100} /></label></div>
              <p className="path-hint">Folder: /{patient === "me" ? profile.user.user_name : "Patient Name"}/Year/{type}/</p>
              <button className="primary-button" disabled={busy || file.size > maxMb * 1024 * 1024}>{busy ? "Uploading…" : "Save document"}</button>{file.size > maxMb * 1024 * 1024 && <p role="alert">Please choose a file smaller than {maxMb} MB.</p>}
            </>}
          </form>
        </section> : <>
          <section className="workspace-card"><div className="card-title"><div><h2>Repositories available in this demo</h2><p>A fictional family repository is seeded locally to demonstrate shared access.</p></div><button disabled={busy} onClick={() => run(load)}>↻ Refresh</button></div><div className="table-scroll"><table className="health-table"><thead><tr><th>Repository owner</th>{DOCUMENT_TYPES.map(item => <th key={item}>{DOCUMENT_LABELS[item]}</th>)}<th>Total</th><th>View</th></tr></thead><tbody>{docs.summary.map(row => <tr key={row.owner_id}><th>{row.name}{row.own && <span className="status-chip">You</span>}</th>{DOCUMENT_TYPES.map(item => <td key={item}>{row.counts[item]}{row.folder_links[item]?.map(link => <div key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">Open {link.label} ↗</a></div>)}</td>)}<td>{row.total}</td><td><button onClick={() => { setOwnerFilter(row.owner_id); setTypeFilter(""); }}>View</button></td></tr>)}</tbody></table></div>{docs.summary.length === 0 && <p>No repositories yet, or authorize Google Drive to scan them.</p>}</section>
          <section className="workspace-card"><div className="card-title"><div><h2>Documents{patientFilter ? ` · ${patientFilter}` : ""}</h2>{(patientFilter || ownerFilter || typeFilter) && <button className="secondary-button" onClick={() => { setPatientFilter(""); setOwnerFilter(""); setTypeFilter(""); }}>Clear filters</button>}</div><button disabled={busy} onClick={() => run(load)}>↻ Refresh documents</button></div><div className="workspace-tabs"><button aria-pressed={!typeFilter} onClick={() => setTypeFilter("")}>All ({filtered.length})</button>{DOCUMENT_TYPES.map(item => <button key={item} aria-pressed={typeFilter === item} onClick={() => setTypeFilter(typeFilter === item ? "" : item)}>{DOCUMENT_LABELS[item]} ({docs.documents.filter(doc => doc.document_type === item && (!ownerFilter || doc.owner_id === ownerFilter) && (!patientFilter || doc.patient_name.toLocaleLowerCase() === patientFilter.toLocaleLowerCase())).length})</button>)}</div><div className="table-scroll"><table className="health-table"><thead><tr><th>Patient</th><th>Type</th><th>Doctor</th><th>Date</th><th>City</th><th>Open document</th></tr></thead><tbody>{filtered.map(doc => <tr key={doc.id}><td>{doc.patient_name}</td><td>{doc.document_type}</td><td>{doc.doctor_name || "—"}</td><td>{doc.document_date}</td><td>{doc.city || "—"}</td><td>{doc.owner_id === profile.user.id ? <a href={doc.drive_url} target="_blank" rel="noopener noreferrer">Open ↗</a> : <button className="secondary-button" disabled={busy} onClick={() => run(async () => { setPreview(await request(`/api/documents/${encodeURIComponent(doc.id)}/preview`)); })}>View only</button>}</td></tr>)}</tbody></table></div>{filtered.length === 0 && <p>No documents in this view yet. Upload a document to add one.</p>}</section>
        </>}
      </> : <>
        <section className="workspace-card"><p className="prototype-note">{profile.hosted ? "Demo documents are stored privately in Supabase." : "Documents stay on this computer."} Sharing requires owner consent and recipient acceptance in Sarathi. Invitation and revocation emails use the configured sender. Recipients must sign in with the invited email. Local sharing does not share Drive files.</p><div className="card-title"><h2>People you’ve given access to</h2><button className="circle-button" aria-label="Add a member" disabled={busy} onClick={() => setAdding(!adding)}>＋</button></div>
          {adding && <form className="workspace-form" onSubmit={event => { event.preventDefault(); memberAction("add"); }}><label>Member name<input value={memberName} onChange={event => setMemberName(event.target.value)} maxLength={100} placeholder="Name of your family member" /></label><label>Member email<input type="email" value={email} onChange={event => { setEmail(event.target.value); setSharing(false); }} required maxLength={254} /></label><label className="checkbox-label"><input type="checkbox" checked={sharing} onChange={event => setSharing(event.target.checked)} required /><span>{sharingConsent(email || "this member")}</span></label><p>{members?.consent_mode === "setu_esign" ? "You must complete Setu eSign before access is granted." : "Prototype consent is recorded with a timestamp; this is not an eSignature."}</p><button className="primary-button" disabled={busy || !sharing}>Invite with view-only access</button></form>}
          <div className="member-list">{members?.outgoing.map(grant => <div className="member-row" key={grant.id}><div><strong>{(grant as typeof grant & { member_name?: string }).member_name || grant.recipient_email}</strong><p>{grant.recipient_email}</p><p>{grant.status.replace(/_/g, " ")} · view only · {grant.consent_method === "setu_esign" ? "Setu eSign" : "Prototype consent"}</p><small>Email: {grant.status === "revoked" ? grant.revocation_email_status : grant.invitation_email_status}</small></div><div className="member-controls">
            {grant.status === "pending_signature" && <>{grant.signing_url && <a className="subtle-link" href={grant.signing_url} target="_blank" rel="noopener noreferrer">Sign consent ↗</a>}<button disabled={busy} onClick={() => memberAction("check-consent", grant.id)}>{grant.signature_request_id ? "Check signature" : "Start signature"}</button></>}
            {grant.status === "pending_drive" && <button disabled={busy} onClick={() => memberAction("check-consent", grant.id)}>Retry grant</button>}

            {grant.status !== "pending_signature" && <button disabled={busy} onClick={() => memberAction("retry-email", grant.id)}>Retry email</button>}
            {grant.status !== "revoked" && <button className="circle-button danger" disabled={busy} aria-label={`Revoke access for ${grant.recipient_email}`} onClick={() => memberAction("remove", grant.id)}>−</button>}
          </div></div>)}</div>{!members?.outgoing.length && <p>You haven’t shared your repository yet.</p>}
        </section>
        <section className="workspace-card"><h2>Received invitations and shared repositories</h2><div className="member-list">{members?.incoming.map(grant => <div className="member-row" key={grant.id}><div><strong>{grant.owner_name}</strong><p>{grant.status === "pending_acceptance" ? "Invitation awaiting your acceptance" : "View-only access"}</p></div><div className="inline-actions">{grant.status === "pending_acceptance" ? <><button className="primary-button" disabled={busy} onClick={() => memberAction("accept", grant.id)}>Accept invitation</button><button className="secondary-button" disabled={busy} onClick={() => memberAction("decline", grant.id)}>Decline</button></> : <><Link className="subtle-link" href="/documents">View documents</Link><button className="circle-button danger" aria-label={`Leave ${grant.owner_name}'s repository`} disabled={busy} onClick={() => memberAction("leave", grant.id)}>−</button></>}</div></div>)}</div>{!members?.incoming.length && <p>No invitations or shared repositories yet.</p>}</section>
      </>}
    </>}
    {preview && <div className="preview-backdrop"><section className="document-preview" role="dialog" aria-modal="true" aria-label={preview.filename}><div className="card-title"><h2>{preview.filename}</h2><button autoFocus onClick={() => setPreview(null)}>Close</button></div><p>Local view-only preview. No edit or download controls are provided. A viewer can still capture displayed information. Unsupported formats have no preview.</p><iframe src={preview.preview_url} title={preview.filename} allow="fullscreen" referrerPolicy="no-referrer" /></section></div>}
  </div>;
}
