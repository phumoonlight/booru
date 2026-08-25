import Link from "next/link";
import type { Metadata } from "next";
import { getPosts } from "@/lib/data/posts";
import { PostGrid } from "@/components/post-grid";
import { Pagination } from "@/components/pagination";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Posts — Booru",
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;

  const rawTags = typeof params.tags === "string" ? params.tags.trim() : "";
  // Multi-tag search lands in Phase 4; until then the first tag filters the grid.
  const tag = rawTags.split(/\s+/).filter(Boolean)[0];

  const rawPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SetupNotice />
      </div>
    );
  }

  const { posts, total, pageCount } = await getPosts({ page, tag });

  const buildHref = (p: number) => {
    const search = new URLSearchParams();
    if (rawTags) search.set("tags", rawTags);
    if (p > 1) search.set("page", String(p));
    const qs = search.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">
          {tag ? (
            <>
              Posts tagged <span className="text-accent">{tag}</span>
            </>
          ) : (
            "Posts"
          )}
        </h1>
        <span className="shrink-0 text-xs text-muted">
          {total} {total === 1 ? "post" : "posts"}
        </span>
      </header>

      {tag && (
        <Link
          href="/"
          className="inline-flex min-h-9 w-fit items-center rounded-full border border-border px-3 text-sm text-muted"
        >
          Clear filter ✕
        </Link>
      )}

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {tag
            ? `No posts tagged "${tag}".`
            : "No posts yet — the first upload will show up here."}
        </p>
      ) : (
        <PostGrid posts={posts} />
      )}

      <Pagination page={page} pageCount={pageCount} buildHref={buildHref} />
    </div>
  );
}
