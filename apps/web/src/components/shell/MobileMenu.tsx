"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "./nav";

/** Hamburger menu shown below the `md` breakpoint. `children` is the account area (wallet, sign in/out). */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  // Open only while the page it was opened on is still showing, so navigating closes it.
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const toggle = () => setOpenOn(open ? null : path);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenOn(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={id}
        onClick={toggle}
        className="flex size-11 items-center justify-center rounded-input border border-border bg-surface">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10201B" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div id={id} className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-border bg-surface px-4 pb-5 pt-2 shadow-lg">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV_LINKS.map((l) => {
              const active = l.href === "/" ? path === "/" : path === l.href || path.startsWith(`${l.href}/`);
              return (
                <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center rounded-input px-3 text-base ${active ? "bg-primary-tint font-semibold text-primary" : "font-medium text-text-2"}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 border-t border-border pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}
