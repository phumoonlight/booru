import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPost, getPostNeighbours, getPostTags } from '@/lib/data/posts'
import { isAdmin } from '@/lib/data/profiles'
import { ManagePost } from '@/components/manage-post'
import { originalUrl } from '@/lib/storage'
import { GroupedTagList } from '@/components/tag-list'
import { SearchHeader } from '@/components/search-header'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/setup-notice'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function generateMetadata({ params }: PageProps<'/posts/[id]'>): Promise<Metadata> {
  const { id } = await params
  return { title: `Post ${id} — Booru` }
}

export default async function PostPage({ params }: PageProps<'/posts/[id]'>) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-4">
        <SetupNotice />
      </div>
    )
  }

  const { id } = await params
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId < 1) notFound()

  const post = await getPost(postId)
  if (!post) notFound()

  const [tags, { prevId, nextId }, canManage] = await Promise.all([
    getPostTags(postId),
    getPostNeighbours(postId),
    isAdmin(),
  ])

  const fullSize = originalUrl(post.md5, post.file_ext)

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4">
      <SearchHeader />

      <div className="flex flex-col gap-5 pt-4 lg:flex-row-reverse lg:items-start">
        {/* Image first on mobile, right column on desktop */}
        <div className="flex flex-col gap-3 lg:flex-1">
          <a href={fullSize} target="_blank" rel="noreferrer" className="block">
            <Image
              src={fullSize}
              alt={`Post ${post.id}`}
              width={post.width}
              height={post.height}
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
              className="h-auto w-full"
            />
          </a>
          <p className="text-center text-xs text-muted">
            Tap the image to open the original ({post.width}×{post.height},{' '}
            {formatBytes(post.file_size)})
          </p>

          <nav className="flex items-center justify-between gap-2">
            {prevId ? (
              <Link
                href={`/posts/${prevId}`}
                title="Newer post"
                aria-label="Newer post"
                className="flex min-h-11 items-center rounded-lg border border-border px-4 text-sm"
              >
                ←
              </Link>
            ) : (
              <span />
            )}
            {nextId && (
              <Link
                href={`/posts/${nextId}`}
                title="Older post"
                aria-label="Older post"
                className="flex min-h-11 items-center rounded-lg border border-border px-4 text-sm"
              >
                →
              </Link>
            )}
          </nav>
        </div>

        <aside className="flex flex-col gap-5 lg:w-64 lg:shrink-0">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Tags</h2>
            <GroupedTagList entries={tags.map((tag) => ({ tag, count: tag.post_count }))} />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Details</h2>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">ID</dt>
                <dd>#{post.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Rating</dt>
                <dd className="capitalize">{post.rating}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Size</dt>
                <dd>
                  {post.width}×{post.height} · {formatBytes(post.file_size)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Type</dt>
                <dd className="uppercase">{post.file_ext}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Posted</dt>
                <dd>
                  <time dateTime={post.created_at}>
                    {new Date(post.created_at).toISOString().slice(0, 10)}
                  </time>
                </dd>
              </div>
              {post.source_url && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted">Source</dt>
                  <dd className="min-w-0">
                    <a
                      href={post.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-accent hover:underline"
                    >
                      {post.source_url}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {canManage && (
            <ManagePost
              postId={post.id}
              initialTags={tags.map((tag) => tag.name).join(' ')}
              initialRating={post.rating}
              initialSourceUrl={post.source_url ?? ''}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
