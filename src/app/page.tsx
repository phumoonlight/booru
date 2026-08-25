const statusStyles: Record<string, string> = {
  ok: "bg-green-500/15 text-green-400 border-green-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  unconfigured: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

async function checkSupabase(): Promise<{ status: string; detail: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || url.includes("YOUR_PROJECT_REF") || !key) {
    return {
      status: "unconfigured",
      detail: "Set NEXT_PUBLIC_SUPABASE_URL and ANON_KEY in .env.local",
    };
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    return res.ok
      ? { status: "ok", detail: "Connected to Supabase" }
      : { status: "error", detail: `Supabase responded ${res.status}` };
  } catch (e) {
    return { status: "error", detail: `Cannot reach Supabase: ${String(e)}` };
  }
}

export default async function Home() {
  const supabase = await checkSupabase();

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold tracking-tight">Booru</h1>
      <p className="text-center text-sm text-muted">
        Phase 0 shell — the post grid arrives in Phase 3.
      </p>
      <div
        className={`rounded-full border px-4 py-1.5 text-sm ${statusStyles[supabase.status]}`}
      >
        {supabase.detail}
      </div>
    </div>
  );
}
