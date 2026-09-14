import { useEffect, useState } from 'react'
import type { ArtistImage } from '../../../shared/api'
import { thumbnailFor, thumbnails } from './artist-thumbs'

/** How tall an example is drawn. One height and a width from the ratio, the way Browse's 📐
 *  Ratio lays out — an example is looked at for its composition, and a square crop is the
 *  one thing guaranteed to cut that off. Two thirds of the stored thumbnail's 384px, so it
 *  is big enough to judge a style by and still sharp. */
const ROW_HEIGHT = 256

/** Stored thumbnails are 384×768 at most, so a ratio past 2 is already letterboxed. */
const MAX_RATIO = 2

/** One example. Asks for its own thumbnail, so a long list draws its names at once and
 *  fills the pictures in behind them. */
export function ArtistThumb({
  image,
  onOpen,
  onRemove,
}: {
  image: ArtistImage
  onOpen: () => void
  /** Drawn as a ✕ in the corner when given — the editor's, not the list's. */
  onRemove?: () => void
}) {
  const [src, setSrc] = useState(thumbnails.get(image.file_name) ?? '')

  useEffect(() => {
    if (thumbnails.has(image.file_name)) return
    let alive = true
    void thumbnailFor(image.file_name).then((url) => {
      if (alive) setSrc(url)
    })
    return () => {
      alive = false
    }
  }, [image.file_name])

  const ratio = Math.min(MAX_RATIO, image.width / Math.max(1, image.height))

  return (
    <div className="relative shrink-0" style={{ height: ROW_HEIGHT, width: ROW_HEIGHT * ratio }}>
      <button
        type="button"
        onClick={onOpen}
        title="View full size"
        className="grid h-full w-full place-items-center overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-accent"
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">…</span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove this example"
          aria-label="Remove this example"
          className="absolute right-0 top-0 rounded-lg bg-background/80 px-1 text-xs hover:bg-background"
        >
          <span aria-hidden>✕</span>
        </button>
      )}
    </div>
  )
}

/**
 * One example, full size. Escape or a click anywhere closes it — the picture included, since
 * clicking a thumbnail is what opened it and clicking again is the natural way back. Until
 * the stored image arrives the thumbnail is stretched into the box, so the right picture is
 * there at once and sharpens without the frame moving.
 */
export function ArtistImageViewer({ image, onClose }: { image: ArtistImage; onClose: () => void }) {
  const [full, setFull] = useState('')

  useEffect(() => {
    let alive = true
    void window.api.artistImage(image.id).then((url) => {
      if (alive) setFull(url)
    })
    return () => {
      alive = false
    }
  }, [image.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Example image"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4"
    >
      <p className="shrink-0 pb-3 text-xs text-muted">
        {image.width}×{image.height}
        {!full && ' · loading the full size…'}
      </p>
      <img
        src={full || thumbnails.get(image.file_name) || ''}
        alt=""
        className="min-h-0 flex-1 cursor-zoom-out object-contain"
      />
    </div>
  )
}
