import Link from "next/link";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="bg-surface border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4">
          <Link href="/" className="text-lg font-extrabold text-primary">CleanConnect</Link>
          <nav className="flex items-center gap-4 text-sm font-semibold text-text-2">
            <Link href="/marketplace">Find a provider</Link>
            <Link href="/car-wash">Car wash</Link>
            <Link href="/providers/join" className="rounded-input bg-primary px-4 py-2.5 text-white hover:bg-primary-hover">
              Become a provider
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8">{children}</main>
    </>
  );
}
