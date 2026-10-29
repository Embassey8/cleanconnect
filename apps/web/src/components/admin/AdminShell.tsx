"use client";

import { Suspense, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ADMIN_NAV, navFor } from "./nav";

export interface ShellInfo {
  name: string;
  role: string;
  badges: { approvals: number; requests: number; tickets: number };
  months: { key: string; long: string }[];
}

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", operations: "Operations", support: "Support agent", finance: "Finance" };

function Sidebar({ info, path, onNavigate }: { info: ShellInfo; path: string; onNavigate?: () => void }) {
  const initials = info.name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("") || "AD";
  return (
    <>
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /></svg>
        </span>
        <span className="flex flex-col"><span className="text-base font-extrabold">CleanConnect</span><span className="text-xs text-[#a9b7b2]">Admin console</span></span>
      </Link>
      <nav aria-label="Admin sections" className="flex flex-col gap-0.5">
        {ADMIN_NAV.map((n) => {
          const active = path === n.href || path.startsWith(`${n.href}/`);
          const count = n.badge ? info.badges[n.badge] : 0;
          return (
            <div key={n.href} className="contents">
              {n.group && n.href !== "/admin/overview" && <span className="px-3 pb-1.5 pt-3.5 text-[11px] font-bold tracking-[0.08em] text-[#a9b7b2]">{n.group}</span>}
              <Link href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                className={`flex min-h-[42px] items-center justify-between gap-2.5 rounded-lg border-l-[3px] px-3 text-sm ${active ? "border-accent bg-[#22352f] font-bold text-white" : "border-transparent font-medium text-[#d5deda] hover:bg-[#1b2c26]"}`}>
                {n.label}
                {count > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${active ? "bg-accent text-ink" : "bg-[#3a4e47] text-white"}`}>{count}</span>}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 border-t border-[#2e433c] p-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-[#3a4e47] text-[13px] font-bold">{initials}</span>
        <span className="flex min-w-0 flex-col"><span className="truncate text-sm font-semibold">{info.name || "Admin"}</span><span className="text-xs text-[#a9b7b2]">{ROLE_LABEL[info.role] ?? "Super admin"}</span></span>
      </div>
    </>
  );
}

function Header({ info, path }: { info: ShellInfo; path: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const cur = navFor(path);
  const isOverview = path === "/admin/overview";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted">
          <Link href="/admin/overview" className="py-1 font-semibold text-primary">Dashboard</Link>
          {!isOverview && <><span aria-hidden="true">›</span><span>{cur.title}</span></>}
        </nav>
        <h1 className="text-[28px] font-extrabold">{cur.title}</h1>
        <p className="text-sm text-muted">{cur.sub}</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <form action="/admin/search" method="get" role="search" className="flex min-h-11 items-center gap-2 rounded-input border border-border bg-surface px-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F5E58" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" name="q" aria-label="Search users, providers, orders" placeholder="Search users, providers, orders" className="w-56 border-0 bg-transparent text-sm outline-none" />
        </form>
        {cur.period && (
          <select aria-label="Period" value={sp.get("month") ?? info.months[0].key}
            onChange={(e) => router.replace(e.target.value === info.months[0].key ? path : `${path}?month=${e.target.value}`)}
            className="min-h-11 rounded-input border border-border bg-surface px-3 text-sm">
            {info.months.map((m, i) => <option key={m.key} value={m.key}>{i === 0 ? "This month" : m.long}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

/** Admin console frame from the design: dark sidebar with grouped nav, page header, content. */
export function AdminShell({ info, children }: { info: ShellInfo; children: React.ReactNode }) {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const id = useId();
  return (
    <div className="flex min-h-screen flex-col bg-bg-admin md:flex-row">
      <header className="relative flex items-center justify-between border-b border-[#2e433c] bg-ink px-4 py-2 text-white md:hidden">
        <span className="text-base font-extrabold">Admin console</span>
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={id}
          onClick={() => setOpenOn(open ? null : path)} className="flex size-11 items-center justify-center rounded-input border border-white/30">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
        {open && (
          <div id={id} className="absolute inset-x-0 top-full z-40 flex max-h-[80dvh] flex-col gap-4 overflow-y-auto bg-ink p-4 shadow-lg">
            <Sidebar info={info} path={path} onNavigate={() => setOpenOn(null)} />
          </div>
        )}
      </header>
      <aside aria-label="Admin navigation" className="hidden w-[260px] shrink-0 flex-col gap-[18px] overflow-y-auto bg-ink px-3.5 py-[22px] text-white md:sticky md:top-0 md:flex md:h-screen">
        <Sidebar info={info} path={path} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-7">
        <Suspense fallback={<div className="h-20" />}><Header info={info} path={path} /></Suspense>
        {children}
      </main>
    </div>
  );
}
