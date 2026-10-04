import { Suspense } from "react";
import { RepositoryWorkspace } from "@/components/documents/RepositoryWorkspace";
export default function MembersPage() { return <Suspense fallback={<p>Loading…</p>}><RepositoryWorkspace section="members" /></Suspense>; }
