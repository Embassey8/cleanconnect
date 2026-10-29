"use client";

import { useState } from "react";
import Link from "next/link";

export interface Conversation {
  id: string; name: string; initial: string; service: string; time: string; preview: string; tone: string;
}

/** Searchable conversation list (left pane). */
export function ConversationList({ items, activeId }: { items: Conversation[]; activeId?: string }) {
  const [q, setQ] = useState("");
  const shown = items.filter((c) => `${c.name} ${c.preview}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="flex flex-col gap-3 border-b border-border p-5">
        <h1 className="text-[22px] font-extrabold">Messages</h1>
        <label className="flex min-h-11 items-center gap-2 rounded-input border border-border px-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F5E58" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" aria-label="Search conversations" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)}
            className="flex-1 border-0 bg-transparent text-sm outline-none" />
        </label>
      </div>
      <ul className="flex flex-col overflow-y-auto">
        {shown.length === 0 && <li className="p-5 text-sm text-muted">{items.length === 0 ? "No conversations yet. Open a provider's profile and tap Message." : "No matches."}</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} aria-current={c.id === activeId ? "page" : undefined}
              className={`flex gap-3 border-l-[3px] px-5 py-4 ${c.id === activeId ? "border-primary bg-primary-tint" : "border-transparent hover:bg-bg"}`}>
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl font-extrabold ${c.tone}`}>{c.initial}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex justify-between gap-2"><span className="truncate text-[15px] font-bold">{c.name}</span><span className="shrink-0 text-xs text-muted">{c.time}</span></span>
                <span className="truncate text-[13px] text-text-2">{c.preview}</span>
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/support" className="flex gap-3 border-l-[3px] border-transparent px-5 py-4 hover:bg-bg">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 13a8 8 0 0 1 16 0" /><rect x="3" y="13" width="4" height="6" rx="1" /><rect x="17" y="13" width="4" height="6" rx="1" /></svg>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold">Help &amp; support</span>
              <span className="truncate text-[13px] text-text-2">Contact CleanConnect support</span>
            </span>
          </Link>
        </li>
      </ul>
    </>
  );
}
