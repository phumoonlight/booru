import Link from 'next/link'
import { getRecentPosts } from '@/lib/data/posts'
import { deletePost } from '@/lib/actions/posts'
import { thumbnailUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export default async function AdminPostsPage() {
  const posts = await getRecentPosts()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Posts ({posts.length})</h2>
        <Link
          href="/admin/upload"
          className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-background"
        >
          Upload
        </Link>
      </div>

      {posts.length === 0 && (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          No posts yet — upload the first one.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {posts.map((post) => (
          <li
            key={post.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2"
          >
            {/* Admin-only list; next/image with remote patterns comes in Phase 3 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl(post.md5)}
              alt={`Post ${post.id}`}
              className="h-16 w-16 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">#{post.id}</p>
              <p className="truncate text-xs text-muted">
                {post.width}×{post.height} · {post.rating} · {post.status} ·{' '}
                {(post.file_size / 1024).toFixed(0)}KB
              </p>
            </div>
            <Link
              href={`/admin/posts/${post.id}`}
              className="flex min-h-11 items-center rounded-lg border border-border px-3 text-sm"
            >
              Edit
            </Link>
            <form action={deletePost}>
              <input type="hidden" name="id" value={post.id} />
              <button
                type="submit"
                className="flex min-h-11 items-center rounded-lg border border-red-500/30 px-3 text-sm text-red-400"
              >
                Delete
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
