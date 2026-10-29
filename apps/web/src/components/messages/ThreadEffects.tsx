"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Keeps a thread fresh: scrolls to the newest message and re-fetches every 10 s while the tab is visible. */
export function ThreadEffects({ count }: { count: number }) {
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10_000);
    return () => clearInterval(t);
  }, [router]);
  return <div ref={end} />;
}
