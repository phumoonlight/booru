import { useEffect, useState } from 'react'
import { RATING_COLOR, RATING_LABEL } from '@common/search'
import type { Post } from '@common/data/posts'
import { ratioOf } from './browse-layout'
import { thumbnailFor, thumbnails } from './browse-thumbs'

/**
 * One thumbnail. It asks for its own image rather than being handed one: the grid can
 * hold a few hundred rows after enough scrolling, and fetching them all up front would
 * stall the first screenful behind the last.
 */
export function Card({
  post,
  layout: drawnAs,
  onOpen,
}: {
  post: Post
  layout: 'grid' | 'ratio'
  onOpen: () => void
}) {
  const [src, setSrc] = useState(thumbnails.get(post.file_name) ?? '')

  useEffect(() => {
    if (thumbnails.has(post.file_name)) return
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
      onClick={onOpen}
      title={`Edit post ${post.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
    >
      {/* Square in the grid, the image's own shape in a ratio row — the only thing the
          two layouts differ in. Against the tile's fixed `ratio × --row-h` width this
          resolves to exactly `--row-h` tall, which is what keeps the row even. The strip below is the same either way: a caption
          burned over the picture reads worse on a dark thumbnail than beside it, and a
          card that changes what it *is* between layouts makes the toggle feel like two
          screens rather than two ways of looking at one. */}
      <div
        className={`grid place-items-center overflow-hidden bg-background ${
          drawnAs === 'ratio' ? '' : 'aspect-square'
        }`}
        style={drawnAs === 'ratio' ? { aspectRatio: ratioOf(post.width, post.height) } : undefined}
      >
        {src ? (
          <img src={src} alt={`Post ${post.id}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">…</span>
        )}
      </div>
      <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-[11px]">
        <span className="text-muted">#{post.id}</span>
        <span className={RATING_COLOR[post.rating]}>{RATING_LABEL[post.rating]}</span>
      </span>
    </button>
  )
}
