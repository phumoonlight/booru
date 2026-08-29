import { useCallback, useState } from 'react'
import { RATING_LABEL, RATINGS, type Rating } from '@web/lib/search'
import { TrashIcon } from './icons'
import { EMPTY_TAGS, TagField, tagsToInput, type TagFieldValue } from './tag-field'
import type { AppStatus, StagedFile, StageOutcome, UploadResult } from '../../../shared/api'

type Status = 'ready' | 'uploading' | 'ok' | 'error'

type Staged = {
  file: StagedFile
  tags: TagFieldValue
  rating: Rating
  sourceUrl: string
  status: Status
  message?: string
  postId?: number
}

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * The uploader, ported from the web's src/components/upload-zone.tsx. Dropping or picking
 * images *stages* them — nothing is created until Upload is pressed — so each one can be
 * previewed, tagged, rated, given a source, or dropped from the queue first. The bulk bar
 * writes the same fields across every staged file at once, for the common case of a set
 * that shares an artist and a rating.
 *
 * Uploads run one at a time: each file is its own bridge call, its own row in the list,
 * and its own failure. A failed row stays staged and editable so pressing Upload again
 * retries just that one.
 *
 * Two things differ from the web, both because the file is already on this machine.
 * Staging is a round trip to the main process, which decodes each image to make the
 * preview and settles the size, the dimensions and the format before a row appears —
 * the web can only measure bytes. And the path is the only thing a row holds: the bytes
 * are read at upload time, on the other side of the bridge, so a 40MB image is never
 * copied into the window at all.
 */
export function UploadQueue({ status }: { status: AppStatus }) {
  const [dragging, setDragging] = useState(false)
  // What the staging step is doing, or null. A label rather than a flag: reading a
  // picked file and fetching one off the web take visibly different amounts of time.
  const [staging, setStaging] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // How far the current run has got. Counting statuses instead would miscount, since rows
  // that failed a previous run are already 'error' before this run reaches them.
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [items, setItems] = useState<Staged[]>([])
  const [bulkTags, setBulkTags] = useState<TagFieldValue>(EMPTY_TAGS)
  const [bulkRating, setBulkRating] = useState<Rating | ''>('')
  // Files the last pick or drop turned away, with the reason main gave for each
  const [refused, setRefused] = useState<string[]>([])

  /**
   * Files never reach the queue unless they can actually be uploaded. The main process
   * checks each one — readable image, within the size and pixel limits — and hands back
   * either a staged row or the reason it can't be one, which is said out loud rather
   * than discovered halfway through an upload.
   */
  const absorb = useCallback((outcomes: StageOutcome[]) => {
    const turnedAway: string[] = []
    setItems((prev) => {
      const seen = new Set(prev.map((item) => item.file.path))
      const added: Staged[] = []
      for (const outcome of outcomes) {
        if (!outcome.ok) {
          turnedAway.push(`${outcome.name} — ${outcome.error}`)
          continue
        }
        if (seen.has(outcome.path)) continue
        seen.add(outcome.path)
        added.push({
          file: {
            path: outcome.path,
            name: outcome.name,
            size: outcome.size,
            width: outcome.width,
            height: outcome.height,
            preview: outcome.preview,
          },
          tags: EMPTY_TAGS,
          rating: 'general',
          sourceUrl: '',
          status: 'ready',
        })
      }
      return added.length > 0 ? [...prev, ...added] : prev
    })
    setRefused(turnedAway)
  }, [])

  const stage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setStaging('Reading images…')
      try {
        absorb(await window.api.stageFiles(paths))
      } finally {
        setStaging(null)
      }
    },
    [absorb]
  )

  /** The other way in: an image dragged straight out of a browser window. */
  const stageUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return
      setStaging(urls.length === 1 ? 'Downloading…' : `Downloading ${urls.length} images…`)
      try {
        absorb(await window.api.fetchImages(urls))
      } finally {
        setStaging(null)
      }
    },
    [absorb]
  )

  const patch = useCallback((path: string, changes: Partial<Staged>) => {
    setItems((prev) =>
      prev.map((item) => (item.file.path === path ? { ...item, ...changes } : item))
    )
  }, [])

  const drop = useCallback((path: string) => {
    setItems((prev) => prev.filter((item) => item.file.path !== path))
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
    for (const item of queue) {
      patch(item.file.path, { status: 'uploading', message: undefined, postId: undefined })

      let result: UploadResult
      try {
        result = await window.api.uploadPost({
          path: item.file.path,
          tags: tagsToInput(item.tags),
          rating: item.rating,
          sourceUrl: item.sourceUrl,
        })
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }
      }

      if (result.ok) {
        patch(item.file.path, { status: 'ok', postId: result.postId })
      } else {
        patch(item.file.path, {
          status: 'error',
          message: result.error,
          postId: result.existingPostId,
        })
      }
      setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
    }
    setBusy(false)
  }

  const pending = items.filter((item) => item.status !== 'ok').length
  const uploaded = items.filter((item) => item.status === 'ok')
  const working = busy || staging !== null

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        // Without an explicit copy effect some sources treat the drop as refused
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)

        // Everything is read out of dataTransfer *now*: it is emptied the moment this
        // handler returns, so nothing here may be deferred behind an await.
        // A dropped File stopped carrying `.path` in Electron 32 — preload asks for it.
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => window.api.pathForFile(file))
          .filter(Boolean)
        if (paths.length > 0) {
          void stage(paths)
          return
        }

        // Nothing local: this came from a browser, and what crossed is an address.
        void stageUrls(imageUrlsFrom(event.dataTransfer))
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
            <p className="text-xs text-muted">Up to {status.limits.maxFileSizeLabel} each</p>
          </>
        )}
        <button
          type="button"
          onClick={() => void window.api.chooseFiles().then(stage)}
          disabled={working}
          className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          {staging ?? (items.length > 0 ? 'Add more images' : 'Choose images')}
        </button>
      </div>

      {refused.length > 0 && (
        <ul className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
          {refused.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
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
                disabled={
                  busy || (bulkTags.tags.length === 0 && !bulkTags.draft.trim() && !bulkRating)
                }
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.file.path}
                className={`flex flex-col gap-3 rounded-lg border bg-surface p-3 sm:flex-row ${
                  item.status === 'error' ? 'border-red-500/40' : 'border-border'
                }`}
              >
                <img
                  src={item.file.preview}
                  alt={item.file.name}
                  className="h-40 w-full shrink-0 rounded-lg bg-background object-contain sm:h-32 sm:w-32"
                />

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={item.file.path}>
                        {item.file.name}
                      </p>
                      <p className="text-xs text-muted">
                        {formatSize(item.file.size)} · {item.file.width}×{item.file.height}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => drop(item.file.path)}
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
                      <PostLink
                        siteUrl={status.siteUrl}
                        postId={item.postId}
                        label={`Uploaded — post #${item.postId}`}
                      />
                    </p>
                  ) : (
                    <>
                      <TagField
                        value={item.tags}
                        onChange={(tags) => patch(item.file.path, { tags })}
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
                              patch(item.file.path, { rating: event.target.value as Rating })
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
                              patch(item.file.path, { sourceUrl: event.target.value })
                            }
                            placeholder="https://…"
                            className="min-h-11 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-accent"
                          />
                        </label>
                      </div>

                      {item.status === 'uploading' && (
                        <p className="text-xs text-muted">Compressing and uploading…</p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-xs text-red-400">
                          {item.message}
                          {item.postId !== undefined && (
                            <>
                              {' — '}
                              <PostLink
                                siteUrl={status.siteUrl}
                                postId={item.postId}
                                label={`post #${item.postId}`}
                              />
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
              disabled={working || pending === 0}
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
                onClick={() => uploaded.forEach((item) => drop(item.file.path))}
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

/**
 * A finished post, opened in the real browser. Without a site URL in settings there is
 * nowhere to send it, so the id is still shown — it just isn't a link.
 */
function PostLink({
  siteUrl,
  postId,
  label,
}: {
  siteUrl: string
  postId: number | undefined
  label: string
}) {
  if (postId === undefined) return null
  if (!siteUrl) return <span className="text-muted">{label}</span>
  return (
    <button
      type="button"
      onClick={() => void window.api.openExternal(`${siteUrl}/posts/${postId}`)}
      className="text-accent underline-offset-2 hover:underline"
    >
      {label}
    </button>
  )
}

/**
 * The image addresses in a drop that carried no file.
 *
 * A browser advertises the same image several ways at once. `text/uri-list` is the
 * direct one and is what Chrome, Firefox and Safari all set for a dragged `<img>`. The
 * HTML flavour is the fallback: dragging a *selection* containing an image sets that and
 * not the URI list, and the `src` has to be dug out of the markup. Plain text last —
 * dragging an address bar or a highlighted link leaves only that.
 *
 * Non-http entries are dropped here rather than in main: a `data:` URL from a canvas is
 * not something to send over the bridge, and the comment lines a uri-list may contain
 * are not addresses at all.
 */
function imageUrlsFrom(transfer: DataTransfer): string[] {
  const found: string[] = []

  const add = (value: string) => {
    const url = value.trim()
    if (!url || url.startsWith('#')) return
    if (!/^https?:\/\//i.test(url)) return
    if (!found.includes(url)) found.push(url)
  }

  const lines = (value: string) => value.split(/\r?\n/)

  lines(transfer.getData('text/uri-list')).forEach(add)

  if (found.length === 0) {
    const html = transfer.getData('text/html')
    if (html) {
      const parsed = new DOMParser().parseFromString(html, 'text/html')
      parsed.querySelectorAll('img').forEach((image) => add(image.getAttribute('src') ?? ''))
    }
  }

  if (found.length === 0) lines(transfer.getData('text/plain')).forEach(add)

  return found
}
