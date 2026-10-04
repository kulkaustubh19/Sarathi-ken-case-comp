 "use client";
import { useEffect, useState } from "react";
import type { CareAddress } from "@/lib/types";

export function useCareAddress() {
  const [address, setAddress] = useState<CareAddress | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/auth", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.user?.id) throw new Error("Log in through Sarathi chat to use your address book.");
      if (!active) return;
      const storageKey = `healthnest-confirmed-address:${data.user.id}`;
      setKey(storageKey);
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as CareAddress;
        if (typeof parsed.formattedAddress === "string" && parsed.validation?.quality === "ok") setAddress(parsed);
      }
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not load your saved address."); });
    return () => { active = false; };
  }, []);
  function saveAddress(value: CareAddress) {
    if (!key) throw new Error("Log in before saving a care address.");
    window.localStorage.setItem(key, JSON.stringify(value)); setAddress(value);
  }
  function removeAddress() { if (key) window.localStorage.removeItem(key); setAddress(null); }
  return { address, saveAddress, removeAddress, error, userId: key?.split(":").at(-1) || null };
}

