import { Suspense } from "react";
import { RepositoryWorkspace } from "@/components/documents/RepositoryWorkspace";
export default function DocumentsPage() { return <Suspense fallback={<p>Loading…</p>}><RepositoryWorkspace /></Suspense>; }
