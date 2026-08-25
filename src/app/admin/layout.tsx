import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profiles";
import { logout } from "@/lib/actions/auth";

// Server-side admin gate for every /admin page — the proxy guard is only the first line.
export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">Admin</h1>
        <form action={logout}>
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-border px-4 text-sm text-muted hover:text-foreground"
          >
            Log out ({profile.username})
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
