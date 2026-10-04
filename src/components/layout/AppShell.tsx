import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Chatbot } from "@/components/agent/Chatbot";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Header />
        <div className="page-content">{children}</div>
      </main>
      <Chatbot />
    </div>
  );
}
