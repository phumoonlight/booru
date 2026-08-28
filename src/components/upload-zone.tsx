'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { uploadPost, type UploadResult } from '@/lib/actions/upload'
import { TrashIcon } from '@/components/icons'
import { EMPTY_TAGS, TagField, tagsToInput, type TagFieldValue } from '@/components/tag-field'
import { RATING_LABEL, RATINGS, type Rating } from '@/lib/search'
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from '@/lib/upload-limits'

type Status = 'ready' | 'uploading' | 'ok' | 'error'

type Staged = {
  key: string
  file: File
  preview: string
  tags: TagFieldValue
  rating: Rating
  sourceUrl: string
  status: Status
  message?: string
  postId?: number
}

/** Two picks of the same file are the same file — name, size and mtime is enough to tell. */
const keyOf = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * The uploader for /upload. Dropping or picking images *stages* them — nothing is
 * created until Upload is pressed — so each one can be previewed, tagged, rated,
 * given a source, or dropped from the queue first. The bulk bar writes the same
 * fields across every staged file at once, for the common case of a set that shares
 * an artist and a rating.
 *
 * Uploads run one at a time: each file is its own server action call, its own row in
 * the list, and its own failure. A failed row stays staged and editable so pressing
 * Upload again retries just that one.
 */
export function UploadZone() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  // How far the current run has got. Counting statuses instead would miscount, since rows
  // that failed a previous run are already 'error' before this run reaches them.
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [items, setItems] = useState<Staged[]>([])
  const [bulkTags, setBulkTags] = useState<TagFieldValue>(EMPTY_TAGS)
  const [bulkRating, setBulkRating] = useState<Rating | ''>('')
  // Names of files the last pick or drop turned away for being too big
  const [tooLarge, setTooLarge] = useState<string[]>([])

  // Object URLs are held by the browser until revoked, so the queue owns the ones it
  // made and frees them when a row leaves or the page does.
  const previews = useRef(new Set<string>())
  useEffect(() => {
    const urls = previews.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  /**
   * Files never reach the queue unless they can actually be uploaded. Anything over the
   * body limit is turned away here with its name said out loud, because the framework
   * rejects an oversized action request before the action runs — there would be no
   * per-file error to show against the row, only a failed POST.
   *
   * A plain function, not a callback in the state updater: creating object URLs is a
   * side effect, and React may run an updater twice.
   */
  function stage(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return

    const seen = new Set(items.map((item) => item.key))
    const added: Staged[] = []
    const refused: string[] = []
    for (const file of images) {
      const key = keyOf(file)
      if (seen.has(key)) continue
      seen.add(key)
      if (file.size > MAX_FILE_SIZE) {
        refused.push(`${file.name} (${formatSize(file.size)})`)
        continue
      }
      const preview = URL.createObjectURL(file)
      previews.current.add(preview)
      added.push({
        key,
        file,
        preview,
        tags: EMPTY_TAGS,
        rating: 'general',
        sourceUrl: '',
        status: 'ready',
      })
    }

    setTooLarge(refused)
    if (added.length > 0) setItems((prev) => [...prev, ...added])
  }

  const patch = useCallback((key: string, changes: Partial<Staged>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...changes } : item)))
  }, [])

  const drop = useCallback((key: string) => {
    setItems((prev) => {
      const going = prev.find((item) => item.key === key)
      if (going) {
        URL.revokeObjectURL(going.preview)
        previews.current.delete(going.preview)
      }
      return prev.filter((item) => item.key !== key)
    })
  }, [])

  /** Merges the bulk tags into every staged row and, if one is chosen, sets the rating. */
  function applyToAll() {
    const extra = bulkTags.draft.trim()
      ? [...bulkTags.tags, { name: bulkTags.draft.trim(), category: 'general' as const }]
      : bulkTags.tags
    setItems((prev) =>
      prev.map((item) => {
        if (item.status === 'ok') return item
        const tags = [...item.tags.tags]
        for (const tag of extra) {
          if (!tags.some((t) => t.name === tag.name)) tags.push(tag)
        }
        return {
          ...item,
          tags: { ...item.tags, tags },
          rating: bulkRating || item.rating,
        }
      })
    )
    setBulkTags(EMPTY_TAGS)
  }

  async function submit() {
    const queue = items.filter((item) => item.status !== 'ok')
    if (queue.length === 0) return

    setBusy(true)
    setProgress({ done: 0, total: queue.length })
    let created = 0
    for (const item of queue) {
      patch(item.key, { status: 'uploading', message: undefined, postId: undefined })

      const data = new FormData()
      data.set('file', item.file)
      data.set('tags', tagsToInput(item.tags))
      data.set('rating', item.rating)
      data.set('source_url', item.sourceUrl)

      let result: UploadResult
      try {
        result = await uploadPost(data)
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }
      }

      if (result.ok) {
        created++
        patch(item.key, { status: 'ok', postId: result.postId })
      } else {
        patch(item.key, { status: 'error', message: result.error, postId: result.existingPostId })
      }
      setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
    }
    setBusy(false)
    if (created > 0) router.refresh()
  }

  const pending = items.filter((item) => item.status !== 'ok').length
  const uploaded = items.filter((item) => item.status === 'ok')

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        stage(Array.from(event.dataTransfer.files))
      }}
      className="flex flex-col gap-4"
    >
      {/* The drop area shrinks to a strip once there's a queue below it to keep room for */}
      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed text-center ${
          items.length > 0 ? 'px-4 py-4' : 'px-6 py-12'
        } ${dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface'}`}
      >
        {items.length === 0 && (
          <>
            <p className="text-base font-semibold">Drop images to upload</p>
            <p className="text-sm text-muted">Tag and rate each one before you submit</p>
            <p className="text-xs text-muted">Up to {MAX_FILE_SIZE_LABEL} each</p>
          </>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          {items.length > 0 ? 'Add more images' : 'Choose images'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            stage(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      {tooLarge.length > 0 && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
          Too large to upload (max {MAX_FILE_SIZE_LABEL}): {tooLarge.join(', ')}
        </p>
      )}

      {items.length > 0 && (
        <>
          {/* Bulk bar: one set of fields written across the whole queue on demand */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
            <p className="text-sm font-semibold">Apply to all {pending} staged</p>
            <TagField
              value={bulkTags}
              onChange={setBulkTags}
              label="Tags to add"
              hint={false}
              disabled={busy}
              placeholder="shared tags"
            />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                Rating
                <select
                  value={bulkRating}
                  disabled={busy}
                  onChange={(event) => setBulkRating(event.target.value as Rating | '')}
                  className="min-h-11 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-accent"
                >
                  <option value="">Leave as is</option>
                  {RATINGS.map((rating) => (
                    <option key={rating} value={rating}>
                      {RATING_LABEL[rating]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={applyToAll}
                disabled={busy || (bulkTags.tags.length === 0 && !bulkTags.draft.trim() && !bulkRating)}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.key}
                className={`flex flex-col gap-3 rounded-lg border bg-surface p-3 sm:flex-row ${
                  item.status === 'error' ? 'border-red-500/40' : 'border-border'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, nothing to optimise */}
                <img
                  src={item.preview}
                  alt={item.file.name}
                  className="h-40 w-full shrink-0 rounded-lg bg-background object-contain sm:h-32 sm:w-32"
                />

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.file.name}</p>
                      <p className="text-xs text-muted">{formatSize(item.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => drop(item.key)}
                      disabled={busy}
                      title="Remove from queue"
                      aria-label={`Remove ${item.file.name} from the queue`}
                      className="flex min-h-9 w-11 shrink-0 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <TrashIcon />
                    </button>
                  </div>

                  {item.status === 'ok' ? (
                    <p className="text-sm">
                      <Link href={`/posts/${item.postId}`} className="text-accent hover:underline">
                        Uploaded — post #{item.postId}
                      </Link>
                    </p>
                  ) : (
                    <>
                      <TagField
                        value={item.tags}
                        onChange={(tags) => patch(item.key, { tags })}
                        hint={false}
                        disabled={busy}
                      />

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <label className="flex flex-col gap-1.5 text-sm sm:w-44">
                          Rating
                          <select
                            value={item.rating}
                            disabled={busy}
                            onChange={(event) =>
                              patch(item.key, { rating: event.target.value as Rating })
                            }
                            className="min-h-11 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-accent"
                          >
                            {RATINGS.map((rating) => (
                              <option key={rating} value={rating}>
                                {RATING_LABEL[rating]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                          Source URL (optional)
                          <input
                            type="url"
                            value={item.sourceUrl}
                            disabled={busy}
                            onChange={(event) =>
                              patch(item.key, { sourceUrl: event.target.value })
                            }
                            placeholder="https://…"
                            className="min-h-11 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-accent"
                          />
                        </label>
                      </div>

                      {item.status === 'uploading' && (
                        <p className="text-xs text-muted">Uploading…</p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-xs text-red-400">
                          {item.message}
                          {item.postId !== undefined && (
                            <>
                              {' — '}
                              <Link href={`/posts/${item.postId}`} className="underline">
                                post #{item.postId}
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background py-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || pending === 0}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-background disabled:opacity-50"
            >
              {busy
                ? `Uploading ${Math.min(progress.done + 1, progress.total)}/${progress.total}…`
                : pending === 0
                  ? 'All uploaded'
                  : `Upload ${pending} ${pending === 1 ? 'post' : 'posts'}`}
            </button>
            {uploaded.length > 0 && !busy && (
              <button
                type="button"
                onClick={() => uploaded.forEach((item) => drop(item.key))}
                className="min-h-11 rounded-lg border border-border px-4 text-sm"
              >
                Clear uploaded
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
