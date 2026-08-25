import Link from "next/link";
import { getCurrentProfile } from "@/lib/data/profiles";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Mobile-first tab bar. A /tags entry and search land in Phase 4,
 * a real /account page in Phase 5.
 */
export async function BottomNav() {
  const profile = isSupabaseConfigured() ? await getCurrentProfile() : null;
  const isAdmin = profile?.role === "admin";

  const items = [
    { href: "/", label: "Posts" },
    ...(isAdmin ? [{ href: "/admin/upload", label: "Upload" }] : []),
    isAdmin
      ? { href: "/admin", label: "Admin" }
      : { href: "/login", label: profile ? "Account" : "Log in" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <li key={item.label} className="flex-1">
            <Link
              href={item.href}
              className="flex min-h-14 items-center justify-center text-sm text-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
