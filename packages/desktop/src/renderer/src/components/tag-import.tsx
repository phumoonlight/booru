import { useEffect, useState } from 'react'
import { RATING_COLOR, RATING_LABEL, tagLabel } from '@common/search'
import { categoryColor } from '@common/tags'
import type { Post } from '@common/data/posts'
import { readPosts, thumbnailFor } from './browse'
import type { TagSeed } from './tag-field'

/**
 * Copying one post's tags onto a staged file.
 *
 * A set arrives a page at a time, and the second page of it is the first page's tags
 * again — the same character, the same artist, the same three things that are true of
 * every image in it. Retyping that was the queue's dullest job, and the bulk bar only
 * helps when the whole queue shares it: what you usually want is *this* post's tags,
 * which are already on the board because you uploaded page one an hour ago.
 *
 * It is Browse's search in a dialog, deliberately — `readPosts` and the thumbnail cache
 * are that screen's, so a query means the same thing here, a bare number is still a post
 * number, and a picture already on screen once is not fetched twice.
 *
 * Picking is two steps. A grid of thumbnails is a poor place to be sure, so a click reads
 * the post's tags and shows them, and nothing is copied until the button under them is
 * pressed. Tags only: a rating belongs to the picture, and a source belongs to where it
 * came from.
 */
export function TagImport({
  onImport,
  onClose,
}: {
  /** The chosen post's tags. Merging them with what the row already has is the caller's. */
  onImport: (tags: TagSeed[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [chosen, setChosen] = useState<{ id: number; tags: TagSeed[] } | null>(null)
  const [reading, setReading] = useState<number | null>(null)

  // Nothing sets loading from in here: this render is already the loading one, and the
  // search box below turns it back on when it asks for something else.
  useEffect(() => {
    let alive = true
    void readPosts(submitted).then((page) => {
      if (!alive) return
      setPosts(page.posts)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [submitted])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function choose(post: Post) {
    setReading(post.id)
    const loaded = await window.api.getPost(post.id)
    setReading(null)
    if (!loaded) return
    setChosen({
      id: post.id,
      tags: loaded.tags.map(({ name, category }) => ({ name, category })),
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import tags from a post"
      className="fixed inset-0 z-50 flex flex-col gap-3 bg-background/95 p-4"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-bold tracking-tight">Import tags</h2>
        <span className="text-xs text-muted">
          {loading ? 'reading…' : `${posts.length} post${posts.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto min-h-9 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-surface"
        >
          Close
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          const next = query.trim()
          // The same search again would leave the effect unfired and this stuck reading.
          if (next === submitted) return
          setLoading(true)
          setSubmitted(next)
        }}
        className="flex shrink-0 gap-2"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="a post number, or tags — the same search as Browse"
          spellCheck={false}
          autoFocus
          className="min-h-9 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="min-h-9 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-surface"
        >
          Search
        </button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {posts.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            {loading ? 'Loading…' : 'No posts match that search.'}
          </p>
        ) : (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {posts.map((post) => (
              <li key={post.id}>
                <Thumb
                  post={post}
                  selected={chosen?.id === post.id}
                  reading={reading === post.id}
                  onChoose={() => void choose(post)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* What was picked, and the only thing that copies anything. It sits under the grid
          rather than replacing it, so a post whose tags turn out to be wrong costs one
          more click and not a search typed again. */}
      {chosen && (
        <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-accent/40 bg-surface p-3">
          <p className="text-sm font-semibold">Post #{chosen.id}</p>
          {chosen.tags.length === 0 ? (
            <p className="text-xs text-muted">This post has no tags to copy.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {chosen.tags.map((tag) => (
                <span
                  key={tag.name}
                  className={`rounded bg-background px-2 py-0.5 font-mono text-xs ${categoryColor(tag.category)}`}
                >
                  {tagLabel(tag.name)}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onImport(chosen.tags)}
              disabled={chosen.tags.length === 0}
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-background disabled:opacity-50"
            >
              Add {chosen.tags.length} {chosen.tags.length === 1 ? 'tag' : 'tags'}
            </button>
            <span className="text-xs text-muted">
              Added to what the card already has — nothing is replaced.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** One result. Same picture the Browse grid draws, from the same cache. */
function Thumb({
  post,
  selected,
  reading,
  onChoose,
}: {
  post: Post
  selected: boolean
  reading: boolean
  onChoose: () => void
}) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let alive = true
    void thumbnailFor(post.file_name).then((url) => {
      if (alive) setSrc(url)
    })
    return () => {
      alive = false
    }
  }, [post.file_name])

  return (
    <button
      type="button"
      onClick={onChoose}
      title={`Copy the tags on post ${post.id}`}
      className={`flex w-full flex-col overflow-hidden rounded-lg border bg-surface text-left transition-colors ${
        selected ? 'border-accent' : 'border-border hover:border-accent'
      }`}
    >
      <div className="grid aspect-square place-items-center overflow-hidden bg-background">
        {src ? (
          <img src={src} alt={`Post ${post.id}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">…</span>
        )}
      </div>
      <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-[11px]">
        <span className="text-muted">{reading ? 'reading…' : `#${post.id}`}</span>
        <span className={RATING_COLOR[post.rating]}>{RATING_LABEL[post.rating]}</span>
      </span>
    </button>
  )
}
