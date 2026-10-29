import { Suspense } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { ProfileForm } from "./ProfileForm";

async function Loader() {
  const user = (await getSessionUser())!;
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("name, phone, email").eq("id", user.id).single();
  return <ProfileForm name={data?.name ?? ""} phone={data?.phone ?? ""} email={data?.email ?? ""} />;
}

export default function EditProfile() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-md">
        <Link href="/account" className="text-sm font-semibold text-primary">← My account</Link>
        <h1 className="mb-6 mt-2 text-2xl font-extrabold">Edit profile</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Loader /></Suspense>
      </div>
    </PublicShell>
  );
}
