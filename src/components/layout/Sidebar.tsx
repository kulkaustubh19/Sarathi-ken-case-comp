import Link from "next/link";
import { navigationItems } from "@/lib/constants";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/">Sarathi<span>Your family care companion</span><span>Across generations</span></Link>
      <nav className="nav-list" aria-label="Primary navigation">
        {navigationItems.map((item) => <Link className="nav-link" href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
    </aside>
  );
}
