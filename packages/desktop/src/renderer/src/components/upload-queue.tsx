import { useCallback, useEffect, useState } from 'react'
import { RATING_LABEL, RATINGS, type Rating } from '@common/search'
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from './icons'
import { ImageViewer } from './image-viewer'
import { EMPTY_TAGS, TagField, tagsToInput, type TagFieldValue } from './tag-field'
import { invalidateTags } from './tag-index'
import {
  impliedRating,
  raisedRating,
  type ImplicationRules,
  type ImpliedRating,
} from '../../../shared/implications'
import { useImplications } from '../implications'
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

/**
 * The rule that has something to say about this row's rating, or null. Shared by the
 * floor and by the note under the select, so the card can never obey one rule and blame
 * another. The draft counts, because `tagsToInput` counts it.
 */
function ratingRule(tags: TagFieldValue, rules: ImplicationRules): ImpliedRating | null {
  const names = [...tags.tags.map((tag) => tag.name), tags.draft.trim()].filter(Boolean)
  return impliedRating(names, rules)
}

/**
 * Why the rating on this card is what it is. A rating that moves on its own is the one
 * change in the queue nobody watched happen — the tag box is where you were looking —
 * so the card names the rule rather than leaving you to guess which of eight tags did
 * it, or whether the app simply lost your rating.
 *
 * Worded as what the rule *asks for*, which stays true whether the row is sitting on
 * that floor or above it: the alternative was claiming to have raised a rating that may
 * well have been set by hand.
 */
function RatingNote({ rule }: { rule: ImpliedRating | null }) {
  if (!rule) return null
  return (
    <p className="flex items-baseline gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted">
      <span aria-hidden>⬆</span>
      <span>
        Your rule on <span className="font-mono text-foreground">{rule.from}</span> asks for at
        least <span className="font-mono text-foreground">{RATING_LABEL[rule.rating]}</span>.
      </span>
    </p>
  )
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
 * Uploads run one at a time, top card first, and ↑/↓ on each card move it, so that
 * order is the author's to choose: post ids come out in the order the queue is in, and a
 * set whose pages or panels arrived in whatever order the file picker sorted them would
 * otherwise be numbered that way for good. Each file is its own bridge call, its
 * own row in the list, and its own failure. A failed row stays staged and editable so
 * pressing Upload again retries just that one.
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
  // The row whose picture is open full-window, held by path so a re-render of the queue
  // can't leave the viewer showing a stale copy of a row that has since been edited.
  const [viewing, setViewing] = useState<string | null>(null)
  // Read here rather than in the field, because this is where a post is made: the fields
  // only show what the rules imply, and `tagsToInput` is what puts it on the upload.
  const rules = useImplications()

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
          rating: 'g',
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

  /**
   * The rating a row keeps once its tags have changed. Raise only — `raisedRating` has
   * why — so a rule can lift a row nobody rated and can never undo a rating that was
   * set by hand or earned by a stronger tag.
   *
   * The draft counts, because `tagsToInput` counts it: a word still being typed is a tag
   * as far as the upload is concerned, and it should be one here too.
   */
  const ratingFor = useCallback(
    (tags: TagFieldValue, current: Rating): Rating =>
      raisedRating(current, ratingRule(tags, rules)),
    [rules]
  )

  const patch = useCallback((path: string, changes: Partial<Staged>) => {
    setItems((prev) =>
      prev.map((item) => (item.file.path === path ? { ...item, ...changes } : item))
    )
  }, [])

  const drop = useCallback((path: string) => {
    setItems((prev) => prev.filter((item) => item.file.path !== path))
    // Clearing uploaded rows behind an open viewer would leave it showing a file the
    // queue no longer has.
    setViewing((current) => (current === path ? null : current))
  }, [])

  /**
   * Swaps one card with its neighbour. Addressed by path rather than by index because
   * the button that calls it renders from a list that may have been reordered since:
   * the position is looked up at the moment of the press, not captured in the handler.
   * Out of range is a no-op rather than a wrap, so holding ↑ on the first card does
   * nothing instead of sending it to the bottom.
   */
  const move = useCallback((path: string, delta: number) => {
    setItems((prev) => {
      const at = prev.findIndex((item) => item.file.path === path)
      const to = at + delta
      if (at < 0 || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [row] = next.splice(at, 1)
      next.splice(to, 0, row)
      return next
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
        const merged = { ...item.tags, tags }
        return {
          ...item,
          tags: merged,
          // The floor is applied after the bulk rating, not before: choosing E1 for a
          // whole set is a decision about the set, and a tag on one image that is worth
          // more than that still speaks for that image.
          rating: ratingFor(merged, bulkRating || item.rating),
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
          tags: tagsToInput(item.tags, rules),
          rating: item.rating,
          sourceUrl: item.sourceUrl,
        })
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }
      }

      if (result.ok) {
        patch(item.file.path, { status: 'ok', postId: result.postId })
        // The post just created tags and moved counts, so the Tags screen's remembered
        // index is out of date. Dropped rather than re-read: it may never be looked at.
        invalidateTags()
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

  // Main can't ask the window what it is holding from inside a `close` handler, so the
  // window tells it as it goes. Uploaded rows count: they carry the post numbers this
  // run made, and closing is what loses them (`main/queue-guard.ts`).
  useEffect(() => {
    window.api.reportQueue({ pending, uploaded: uploaded.length, busy })
  }, [pending, uploaded.length, busy])

  // Logging out is the one thing that takes this component away rather than hiding it,
  // and a count left behind would have main guarding a queue that no longer exists.
  useEffect(() => {
    return () => window.api.reportQueue({ pending: 0, uploaded: 0, busy: false })
  }, [])
  const working = busy || staging !== null
  const viewed = items.find((item) => item.file.path === viewing)

  return (
    <>
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
        {/*
        The drop area shrinks to a strip once there's a queue below it to keep room for.
        The whole thing is the button, not just the label inside it: a dashed rectangle
        saying "drop images" is already the target, and asking for a second, smaller aim
        at the word inside it only made the obvious click miss. One button also means one
        tab stop and one disabled state while staging runs.
      */}
        <button
          type="button"
          onClick={() => void window.api.chooseFiles().then(stage)}
          disabled={working}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed text-center disabled:opacity-50 ${
            items.length > 0 ? 'px-4 py-4' : 'px-6 py-12'
          } ${dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent'}`}
        >
          {items.length === 0 && (
            <>
              <p className="text-base font-semibold">Drop images to upload</p>
              <p className="text-sm text-muted">Tag and rate each one before you submit</p>
              <p className="text-xs text-muted">Up to {status.limits.maxFileSizeLabel} each</p>
            </>
          )}
          <span className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <span aria-hidden>📂</span>
            {staging ?? 'Browse'}
          </span>
        </button>

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

            <p className="text-xs text-muted">
              Posts are created top to bottom — ↑ and ↓ on a card move it.
            </p>

            {/*
              One card per row, the picture across the whole of it. It was a list with a
              128px thumbnail in the corner, then a two-column grid; both were a
              compromise with a preview whose only job is letting you tell two pages of a
              set apart before you tag them, and neither was big enough to do it.

              Still a grid rather than a flex column, for `auto-rows-fr`: every card comes
              out the height of the tallest, so a card carrying six tags doesn't sit next
              to a stub.
            */}
            <ul className="grid auto-rows-fr grid-cols-1 gap-3">
              {items.map((item, index) => (
                <li
                  key={item.file.path}
                  className={`flex h-full flex-col gap-3 rounded-lg border bg-surface p-3 ${
                    item.status === 'error' ? 'border-red-500/40' : 'border-border'
                  }`}
                >
                  {/* Order, name and remove on one line above the picture. */}
                  <div className="flex items-start gap-2">
                    {/*
                      Reordering is two buttons, not a drag. Dragging a card meant holding
                      a handle while the list rearranged under the pointer, which is fine
                      for a short list of small rows and awkward once a card is most of
                      the window: the target is off-screen as often as not, and the drag
                      had to be kept clear of the drop zone's own handlers and of text
                      selection inside the fields. A press per position is duller and
                      always works.
                    */}
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => move(item.file.path, -1)}
                        disabled={busy || index === 0}
                        title="Move up"
                        aria-label={`Move ${item.file.name} up — currently ${index + 1} of ${items.length}`}
                        className="flex min-h-9 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(item.file.path, 1)}
                        disabled={busy || index === items.length - 1}
                        title="Move down"
                        aria-label={`Move ${item.file.name} down — currently ${index + 1} of ${items.length}`}
                        className="flex min-h-9 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDownIcon />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={item.file.path}>
                        <span className="text-muted">{index + 1}.</span> {item.file.name}
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

                  {/* The thumbnail is the button. `object-contain` on a fixed height:
                    cropping to fill would hide exactly the edges that tell two variants
                    of the same image apart. Clicking still opens the full-window viewer,
                    which is now the difference between a good look and the actual file
                    rather than between a stamp and a look. Raise `h-192` and
                    `PREVIEW_HEIGHT` in `main/staging.ts` moves with it, or the picture
                    goes soft. */}
                  <button
                    type="button"
                    onClick={() => setViewing(item.file.path)}
                    title="Open a bigger preview"
                    aria-label={`Open a bigger preview of ${item.file.name}`}
                    className="h-192 w-full shrink-0 overflow-hidden rounded-lg bg-background ring-border hover:ring-2"
                  >
                    <img
                      src={item.file.preview}
                      alt={item.file.name}
                      className="h-full w-full object-contain"
                    />
                  </button>

                  <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                          onChange={(tags) =>
                            patch(item.file.path, {
                              tags,
                              rating: ratingFor(tags, item.rating),
                            })
                          }
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

                        <RatingNote rule={ratingRule(item.tags, rules)} />

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

      {/* Outside the drop zone on purpose: a full-window overlay sitting inside it would
        answer the drag handlers with its own hit box while it is up. */}
      {viewed && (
        <ImageViewer key={viewed.file.path} file={viewed.file} onClose={() => setViewing(null)} />
      )}
    </>
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
