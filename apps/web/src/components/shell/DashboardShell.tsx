"use client";

import { Suspense, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string }

/**
 * Sidebar on desktop; on phones a top bar with a hamburger that opens the same links.
 * `dark` = admin look.
 */
export function DashboardShell(props: ShellProps) {
  // usePathname() needs a Suspense boundary; until it resolves, show the page content without the chrome.
  return (
    <Suspense fallback={<main className="min-w-0 p-4 md:p-8">{props.children}</main>}>
      <Shell {...props} />
    </Suspense>
  );
}

interface ShellProps { title: string; nav: NavItem[]; dark?: boolean; children: React.ReactNode }

function Shell({ title, nav, dark = false, children }: ShellProps) {
  // Open only while the page it was opened on is still showing, so navigating closes it.
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (fn: (o: boolean) => boolean) => setOpenOn((cur) => (fn(cur === path) ? path : null));
  const id = useId();

  const bar = dark ? "bg-ink text-white" : "bg-surface border-border";
  const link = (n: NavItem) => {
    const active = path === n.href || (n.href !== "/" && path.startsWith(`${n.href}/`));
    return (
      <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center rounded-input px-3 py-2.5 text-sm font-semibold hover:bg-primary-tint hover:text-primary ${active ? "bg-primary-tint text-primary" : "opacity-90"}`}>
        {n.label}
      </Link>
    );
  };

  return (
    <div className={`flex min-h-screen flex-col md:flex-row ${dark ? "bg-bg-admin" : "bg-bg"}`}>
      <header className={`relative flex items-center justify-between border-b px-4 py-2 md:hidden ${bar}`}>
        <span className="text-base font-extrabold">{title}</span>
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className={`flex size-11 items-center justify-center rounded-input border ${dark ? "border-white/30" : "border-border"}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        {open && (
          <nav id={id} aria-label={`${title} menu`} className={`absolute inset-x-0 top-full z-40 flex max-h-[70dvh] flex-col gap-1 overflow-y-auto border-b p-2 shadow-lg ${bar}`}>
            {nav.map(link)}
            <Link href="/" className="flex min-h-11 items-center rounded-input px-3 py-2.5 text-sm font-semibold opacity-70">← Back to site</Link>
          </nav>
        )}
      </header>
      <aside className={`hidden md:block md:w-60 md:shrink-0 ${dark ? "bg-ink text-white" : "border-r border-border bg-surface"}`}>
        <div className="px-4 py-4 text-base font-extrabold">{title}</div>
        <nav className="flex flex-col gap-1 px-2 pb-4">{nav.map(link)}</nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
