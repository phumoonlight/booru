import { useEffect, useState } from 'react'
import type { StagedFile } from '../../../shared/api'

/**
 * The staged image, big. The queue's row thumbnail is 200px tall — enough to tell two
 * files apart, not enough to see whether the one you are about to tag is the right crop
 * or is the version with the watermark, which is the question you actually have while
 * staging a folder.
 *
 * The bigger picture is asked for when this opens rather than carried by every row: it
 * is a screenful of base64 per file, and the queue routinely holds forty. Until it
 * arrives the row's own thumbnail is stretched into the same box — soft, but the right
 * picture immediately, and it swaps under you without the frame moving.
 *
 * Escape and a click on the backdrop both close it, because the whole window is the
 * dismiss target and reaching for the × in a corner is the slow way out.
 */
export function ImageViewer({ file, onClose }: { file: StagedFile; onClose: () => void }) {
  const [full, setFull] = useState('')

  // Keyed by path where it is rendered, so a different file is a different component
  // rather than this one holding the last file's picture until the new one arrives.
  useEffect(() => {
    let alive = true
    void window.api.previewFile(file.path).then((preview) => {
      if (alive) setFull(preview)
    })
    return () => {
      alive = false
    }
  }, [file.path])

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
      aria-label={file.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={file.path}>
            {file.name}
          </p>
          <p className="text-xs text-muted">
            {file.width}×{file.height}
            {!full && ' · loading the full size…'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the preview"
          className="flex min-h-11 shrink-0 items-center rounded-lg border border-border px-4 text-sm"
        >
          Close
        </button>
      </div>

      {/*
        The click that closes this is on the backdrop, so the image swallows its own —
        clicking the picture you opened to look at should not put it away.
      */}
      <img
        src={full || file.preview}
        alt={file.name}
        onClick={(event) => event.stopPropagation()}
        className="min-h-0 flex-1 cursor-default object-contain"
      />
    </div>
  )
}
