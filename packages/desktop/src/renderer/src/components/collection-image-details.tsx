import type { CollectionPost } from '../../../shared/api'
import { fullImageUrl } from './collection-thumbs'
import { useDrawnBox } from './drawn-box'

/**
 * What an image's panel shows about the image itself rather than asks of it: a small copy of
 * the picture and a line of facts about the file. Kept apart from the panel, which is the
 * source, the tags and the buttons that change them.
 */
/** How tall the panel's picture is drawn — a glance at which image this is, not a view of it. */
const PREVIEW_HEIGHT = 96

/**
 * The image the panel is about, small, at the head of the panel. Pinned at the foot of the
 * window, the panel can be a screen away from the tile it was opened from; this answers
 * "which one is this" without scrolling back to the outline. A click opens the full size.
 * Cut to its box like a tile (`useDrawnBox`), and capped at 2:1 like the grid.
 */
export function Preview({ post, onView }: { post: CollectionPost; onView: () => void }) {
  const [box, drawn] = useDrawnBox<HTMLButtonElement>()
  const ratio = Math.min(2, post.width / Math.max(1, post.height))

  return (
    <button
      ref={box}
      type="button"
      onClick={onView}
      title="Look at the stored image at its full size"
      style={{ height: PREVIEW_HEIGHT, width: Math.round(PREVIEW_HEIGHT * ratio) }}
      className="shrink-0 overflow-hidden border border-border bg-background transition-colors hover:border-hover"
    >
      {drawn && (
        <img
          src={fullImageUrl(post.file_name, post.file_ext, drawn)}
          alt=""
          decoding="async"
          className="h-full w-full object-cover"
        />
      )}
    </button>
  )
}

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** The stored size, in the unit that keeps it under four figures. */
function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * What the row knows about the file, in one muted line: when it landed, what it weighs as
 * stored (the AVIF when that won, so not always what was uploaded), its pixels, and how many
 * times the website has shown it.
 */
export function Facts({ post }: { post: CollectionPost }) {
  const views = `${post.view_count.toLocaleString()} view${post.view_count === 1 ? '' : 's'}`
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      <span title={post.created_at}>
        <span aria-hidden>📅</span> {DATE.format(new Date(post.created_at))}
      </span>
      <span>
        <span aria-hidden>💾</span> {bytes(post.file_size)}
      </span>
      <span>
        <span aria-hidden>📐</span> {post.width}×{post.height}
      </span>
      <span>
        <span aria-hidden>👁️</span> {views}
      </span>
    </p>
  )
}
