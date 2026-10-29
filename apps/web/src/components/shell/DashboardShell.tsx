import Link from "next/link";

export interface NavItem { href: string; label: string }

/** Sidebar on desktop; wraps to a top strip on mobile. `dark` = admin look. */
export function DashboardShell({
  title, nav, dark = false, children,
}: { title: string; nav: NavItem[]; dark?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-screen flex-col md:flex-row ${dark ? "bg-bg-admin" : "bg-bg"}`}>
      <aside className={`md:w-60 md:shrink-0 ${dark ? "bg-ink text-white" : "bg-surface border-r border-border"}`}>
        <div className="px-4 py-4 text-base font-extrabold">{title}</div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className="min-h-11 whitespace-nowrap rounded-input px-3 py-2.5 text-sm font-semibold opacity-90 hover:bg-primary-tint hover:text-primary">
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
