import { useEffect, useState } from 'react'

/**
 * One stored image, full size, over everything.
 *
 * Escape or a click anywhere closes it — the picture included, since clicking a thumbnail
 * is what opened it and clicking again is the natural way back. Until the stored image
 * arrives the thumbnail is stretched into the box, so the right picture is there at once
 * and sharpens without the frame moving.
 *
 * `load` is a channel — `collectionImage` or `artistImage` — rather than a URL, because the
 * window's CSP is `img-src 'self' data:` and the bytes come across the bridge already
 * encoded. It is asked again whenever `id` changes and never otherwise, so a viewer left
 * open costs one fetch; the main side caches the file it fetched (`main/image-cache.ts`),
 * so opening the same picture tomorrow costs none.
 */
export function ImageViewer({
  id,
  width,
  height,
  fallback,
  label,
  load,
  onClose,
}: {
  id: number
  width: number
  height: number
  /** The thumbnail already on screen, drawn until the full size lands. */
  fallback: string
  label: string
  load: (id: number) => Promise<string>
  onClose: () => void
}) {
  const [full, setFull] = useState('')

  useEffect(() => {
    let alive = true
    void load(id).then((url) => {
      if (alive) setFull(url)
    })
    return () => {
      alive = false
    }
  }, [id, load])

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
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4"
    >
      <p className="shrink-0 pb-3 text-xs text-muted">
        {width}×{height}
        {!full && ' · loading the full size…'}
      </p>
      <img
        src={full || fallback}
        alt=""
        className="min-h-0 flex-1 cursor-zoom-out object-contain"
      />
    </div>
  )
}
