import Link from "next/link";

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Admin dashboard — upload and post management arrive in Phase 2.
      </p>
      <ul className="flex flex-col gap-2">
        <li>
          <Link
            href="/admin"
            className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted"
          >
            Upload (Phase 2)
          </Link>
        </li>
        <li>
          <Link
            href="/admin"
            className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted"
          >
            Manage posts (Phase 2)
          </Link>
        </li>
      </ul>
    </div>
  );
}
