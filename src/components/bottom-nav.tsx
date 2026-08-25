import Link from "next/link";

// Placeholder bottom tab bar (Phase 0). Items become real pages in later phases.
const items = [
  { href: "/", label: "Posts" },
  { href: "/", label: "Search" },
  { href: "/", label: "Account" },
] as const;

export function BottomNav() {
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
