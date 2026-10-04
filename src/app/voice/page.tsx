import { Suspense } from "react";
import { VoiceDemo } from "@/components/agent/VoiceDemo";

export default function VoiceRailPage() { return <Suspense fallback={<p>Starting voice inquiries…</p>}><VoiceDemo hosted={Boolean(process.env.VERCEL)} /></Suspense>; }
