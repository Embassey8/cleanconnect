"use client";

import { Suspense, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";

const NAV = [
  { href: "/provider", label: "Overview & orders", match: (p: string) => p === "/provider" || p.startsWith("/provider/orders") },
  { href: "/provider/prices", label: "Packages & prices" },
  { href: "/provider/areas", label: "Availability & areas" },
  { href: "/provider/team", label: "Team" },
  { href: "/provider/wallet", label: "Earnings & payouts" },
  { href: "/messages", label: "Messages" },
  { href: "/provider/reviews", label: "Reviews" },
  { href: "/provider/profile", label: "Profile & verification" },
  { href: "/provider/vip", label: "VIP", vip: true },
  { href: "/support", label: "Support" },
];

function Nav({ path, subtitle, onNavigate }: { path: string; subtitle: string; onNavigate?: () => void }) {
  return (
    <>
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /></svg>
        </span>
        <span className="flex flex-col"><span className="text-base font-extrabold">CleanConnect</span><span className="text-xs text-muted">{subtitle}</span></span>
      </Link>
      <nav aria-label="Provider navigation" className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = n.match ? n.match(path) : path === n.href || path.startsWith(`${n.href}/`);
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={`flex min-h-[42px] items-center rounded-lg px-3 text-sm ${active ? "bg-primary-tint font-bold text-primary" : n.vip ? "font-semibold text-vip hover:bg-bg" : "text-text-2 hover:bg-bg"}`}>{n.label}</Link>
          );
        })}
      </nav>
      <form action={signOut} className="mt-auto"><button className="min-h-11 w-full rounded-lg text-sm font-semibold text-muted hover:bg-bg">Sign out</button></form>
    </>
  );
}

function Shell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const id = useId();
  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <header className="relative flex items-center justify-between border-b border-border bg-surface px-4 py-2 md:hidden">
        <span className="text-base font-extrabold">{subtitle}</span>
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={id}
          onClick={() => setOpenOn(open ? null : path)} className="flex size-11 items-center justify-center rounded-input border border-border">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
        {open && <div id={id} className="absolute inset-x-0 top-full z-40 flex max-h-[80dvh] flex-col gap-4 overflow-y-auto border-b border-border bg-surface p-4 shadow-lg"><Nav path={path} subtitle={subtitle} onNavigate={() => setOpenOn(null)} /></div>}
      </header>
      <aside aria-label="Provider navigation" className="hidden w-[250px] shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-border bg-surface px-3 py-5 md:sticky md:top-0 md:flex md:h-screen">
        <Nav path={path} subtitle={subtitle} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-[22px] p-4 md:p-7">{children}</main>
    </div>
  );
}

/** Provider console frame from the design: white sidebar with green accents. */
export function ProviderShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return <Suspense fallback={<main className="p-4 md:p-7">{children}</main>}><Shell subtitle={subtitle}>{children}</Shell></Suspense>;
}
