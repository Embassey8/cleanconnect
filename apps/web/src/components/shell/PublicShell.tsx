import { Suspense } from "react";
import Link from "next/link";
import { HeaderActions } from "./HeaderActions";
import { NavLinks } from "./NavLinks";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-xl font-extrabold text-ink">
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </svg>
      </span>
      CleanConnect
    </Link>
  );
}

/** Site header and footer from the designs. `bare` lets a page (the home hero) manage its own width. */
export function PublicShell({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3.5">
          <Logo />
          <NavLinks />
          <Suspense fallback={<div className="h-11" />}><HeaderActions /></Suspense>
        </div>
      </header>
      {bare ? children : <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 md:px-6">{children}</main>}
      <footer className="mt-auto border-t border-border bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 px-6 py-6 text-sm text-muted">
          <span>© CleanConnect</span>
          <span className="flex flex-wrap gap-5">
            <Link href="/support">Help &amp; support</Link><Link href="/providers/join">For providers</Link>
            <Link href="/apply?kind=partner">Car wash partners</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
