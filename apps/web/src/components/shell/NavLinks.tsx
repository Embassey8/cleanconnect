"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/car-wash", label: "Car wash" },
  { href: "/messages", label: "Messages" },
  { href: "/account", label: "My orders" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
      {LINKS.map((l) => {
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
