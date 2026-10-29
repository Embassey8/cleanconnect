"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "./nav";


export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {NAV_LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
            className={`min-h-11 rounded-lg px-3.5 py-2.5 text-[15px] ${active ? "bg-primary-tint font-semibold text-primary" : "font-medium text-text-2 hover:bg-bg"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
