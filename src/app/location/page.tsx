import { Suspense } from "react";
import { LocationIntelligence } from "@/components/dashboard/LocationIntelligence";
export default function LocationPage() { return <Suspense fallback={<p>Loading care locations…</p>}><LocationIntelligence /></Suspense>; }
