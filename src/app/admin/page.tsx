import Link from "next/link";

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        <li>
          <Link
            href="/admin/upload"
            className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm hover:border-accent"
          >
            Upload
          </Link>
        </li>
        <li>
          <Link
            href="/admin/posts"
            className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm hover:border-accent"
          >
            Manage posts
          </Link>
        </li>
      </ul>
    </div>
  );
}
