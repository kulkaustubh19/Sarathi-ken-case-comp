"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCareAddress } from "./useCareAddress";
import type { CareAddress, LabRecommendation } from "@/lib/types";

const demoLabNames = ["Demo Lakeview Lab", "Demo Greenfield Lab", "Demo CityCare Lab"];
const demoLabAddresses = ["Building 12, MG Road, Bengaluru, Karnataka 560001", "Building 24, Residency Road, Bengaluru, Karnataka 560025", "Building 8, Richmond Road, Bengaluru, Karnataka 560025"];

export function LocationIntelligence() {
  const params = useSearchParams();
  const fromChat = params.get("focus") === "labs";
  const [tab, setTab] = useState<"address" | "labs">(fromChat ? "labs" : "address");
  const [raw, setRaw] = useState("Papa stays near Hanuman Mandir, second lane after the SBI ATM");
  const [labAddresses, setLabAddresses] = useState(demoLabAddresses);
  const [labNames, setLabNames] = useState(demoLabNames);
  const [selectedLab, setSelectedLab] = useState<string | null>(null);
  const [demoMaps, setDemoMaps] = useState(true);
  const [draft, setDraft] = useState<CareAddress | null>(null);
  const { address: confirmed, saveAddress, error: addressError, userId } = useCareAddress();
  const router = useRouter();
  const [recommendation, setRecommendation] = useState<LabRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (fromChat) setTab("labs"); }, [fromChat]);

  async function analyze() {
    setBusy(true); setError(null); setDraft(null);
    try {
      const response = await fetch("/api/delhivery/address", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: raw, demo: demoMaps }) });
      const payload = await response.json() as CareAddress & { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setDraft(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to analyze address."); } finally { setBusy(false); }
  }

  function confirm() {
    if (!draft || draft.validation.quality !== "ok") return;
    const value = { ...draft, confirmedAt: new Date().toISOString() };
    try { saveAddress(value); if (fromChat) setTab("labs"); else router.push("/address-book"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save the address."); }
  }

  async function verifyLabs() {
    if (!confirmed) return;
    setBusy(true); setError(null); setRecommendation(null); setSelectedLab(null);
    try {
      const response = await fetch("/api/delhivery/labs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: confirmed, labAddresses, labNames, demo: demoMaps }) });
      const payload = await response.json() as LabRecommendation & { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setRecommendation(payload);
      window.dispatchEvent(new CustomEvent("healthnest-agent-update", { detail: { user_id: userId, message: payload.ranked.length ? `The lab list is updated. Select a lab and proceed with booking by saying “Book a blood test with ${payload.ranked[0].name}”. These are verified addresses of demo candidates.` : "No candidate addresses could be verified. Please update them and fetch labs again." } }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to verify supplied lab addresses."); } finally { setBusy(false); }
  }

  async function selectLab(id: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lab_id: id }) });
      const lab = await response.json(); if (!response.ok) throw new Error(lab.error || "Could not select lab.");
      setSelectedLab(id);
      window.dispatchEvent(new CustomEvent("healthnest-agent-update", { detail: { user_id: userId, message: `Selected ${lab.name}. Say “Book a blood test with ${lab.name}” or “Book this test” and I’ll run the in-app booking simulation.` } }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not select lab."); } finally { setBusy(false); }
  }

  function updateLab(index: number, value: string) {
    setRecommendation(null); setSelectedLab(null);
    setLabAddresses((current) => current.map((address, currentIndex) => currentIndex === index ? value : address));
  }

  return <div className="location-demo">
    {addressError && <section className="voice-card voice-error" role="alert">{addressError}</section>}
    <section className="voice-card voice-intro"><p className="eyebrow">Delhivery location intelligence</p><h1>Turn household locations into care-ready addresses</h1><p>Delhivery validates and geocodes locations. It does not discover providers or make clinical decisions.</p></section>
    <section className="voice-card"><label className="checkbox-label"><input type="checkbox" checked={demoMaps} disabled={busy} onChange={event => { setDemoMaps(event.target.checked); setError(null); setDraft(null); setRecommendation(null); }} />Use Demo Maps for this prototype</label><p className="helper">Local Demo Maps is enabled by default for this prototype. It checks address completeness and uses simulated coordinates. Uncheck to use live Delhivery.</p></section>
    {fromChat && <section className="voice-card"><h2>Find labs for your blood test</h2><p>Confirm your care address, then click Fetch verified labs. Choose an accepted lab from the list and ask Sarathi to book it.</p></section>}
    <div className="choice-row">
      <button className={tab === "address" ? "choice active" : "choice"} onClick={() => setTab("address")}>Add a new address to your address book</button>
      <button className={tab === "labs" ? "choice active" : "choice"} onClick={() => setTab("labs")}>Fetch verified labs</button>
    </div>
    {error && <section className="voice-card voice-error" role="alert">{error}</section>}
    {tab === "address" ? <section className="voice-card location-form">
      <h2>Add a care address</h2><p className="helper">The address is stored in this browser only after you confirm it.</p>
      <label>Informal household address<textarea value={raw} onChange={(event) => setRaw(event.target.value)} maxLength={500} /></label>
      <p className="helper">Include your house or building, city and six-digit pincode. A landmark alone is not enough. Example: Building 12, near Hanuman Mandir, Bengaluru 560001.</p>
      <button className="run-call" disabled={busy || !raw.trim()} onClick={analyze}>{busy ? "Checking address…" : "Standardize address"}</button>
      {draft && <AddressCard address={draft} confirm={confirm} />}
    </section> : <section className="voice-card location-form">
      <h2>Fetch verified labs</h2>
      {!confirmed ? <div><p>First add and confirm your complete care address.</p><button className="run-call" onClick={() => setTab("address")}>Add care address</button></div> : <>
        <p className="helper">Your confirmed care address: {confirmed.formattedAddress}</p>
        <p className="helper">These are editable fictional demo candidates. {demoMaps ? "Demo Maps checks address completeness locally." : "Delhivery verifies the supplied addresses."} This is not live provider discovery. Replace the names and addresses if needed.</p>
        {labAddresses.map((address, index) => <div key={index}><label>Lab {index + 1} name<input value={labNames[index]} maxLength={80} onChange={event => { setLabNames(current => current.map((name, i) => i === index ? event.target.value : name)); setRecommendation(null); }} /></label><label>Lab {index + 1} address<textarea value={address} onChange={(event) => updateLab(index, event.target.value)} maxLength={500} placeholder="Building / street, locality, city, pincode" /></label></div>)}
        <button className="run-call" disabled={busy || labAddresses.some((address) => !address.trim())} onClick={verifyLabs}>{busy ? "Verifying lab addresses…" : "Fetch verified labs"}</button>
      </>}
      {recommendation && <LabCard recommendation={recommendation} selectLab={selectLab} selectedLab={selectedLab} busy={busy} />}
    </section>}
  </div>;
}

function AddressCard({ address, confirm }: { address: CareAddress; confirm: () => void }) {
  return <div className="address-result"><h2>Suggested address <small>{address.source === "demo" ? "Demo Maps" : "Delhivery Maps"}</small></h2><p>{address.formattedAddress}</p><dl><div><dt>Quality</dt><dd>{address.validation.quality}</dd></div><div><dt>Confidence</dt><dd>{address.validation.confidence}</dd></div>{address.location && <div><dt>Coordinates</dt><dd>{address.location.lat.toFixed(4)}, {address.location.lng.toFixed(4)}</dd></div>}</dl>{address.validation.missingFields.length > 0 ? <p className="confirmation">Please add: {address.validation.missingFields.join(", ")}.</p> : <button className="trial-call" onClick={confirm}>Add to address book</button>}</div>;
}

function LabCard({ recommendation, selectLab, selectedLab, busy }: { recommendation: LabRecommendation; selectLab: (id: string) => Promise<void>; selectedLab: string | null; busy: boolean }) {
  const label = recommendation.source === "demo" ? "Demo Maps" : "Delhivery Maps";
  const candidates = [...recommendation.ranked, ...recommendation.unverified];
  return <div className="lab-result">
    <p className="helper">Source: {label}. These are address-validation results only; they do not confirm a lab’s availability, services, or clinical suitability.</p>
    <h3>Lab address validation</h3>
    {candidates.map((lab) => {
      const validation = lab.address.validation;
      const valid = validation.quality === "ok";
      const missing = validation.missingFields.length > 0 ? `Add: ${validation.missingFields.join(", ")}.` : "No individual missing fields were returned by the address service.";
      return <article className="lab-row" key={lab.id}>
        <strong>{lab.name} — {valid ? "address accepted" : "needs more detail"}</strong>
        <span>{lab.address.formattedAddress || lab.address.rawAddress}</span>
        <span>Validation: {validation.quality} · confidence: {validation.confidence}{validation.granularity ? ` · granularity: ${validation.granularity}` : ""}</span>
        <span>{valid ? validation.reason : missing}</span>
        {valid && lab.address.location && <button className="run-call" disabled={busy || selectedLab === lab.id} onClick={() => void selectLab(lab.id)}>{selectedLab === lab.id ? "Selected" : "Select this lab"}</button>}
      </article>;
    })}
  </div>;
}
