import { useCallback, useEffect, useState } from 'react'
import { RATING_COLOR, RATING_LABEL, RATINGS, tagLabel, type Rating } from '@common/search'
import { BUTTON_SM } from './buttons'
import { TrashIcon } from './icons'
import { ImageViewer } from './image-viewer'
import { categoryColor } from '@common/tags'
import { CategoryTagField, seedsToInput } from './category-tag-field'
import type { TagSeed } from './tag-seed'
import { invalidateTags } from './tag-index'
import { invalidateBrowse } from './browse'
import { TagImport } from './tag-import'
import { RatingGuide } from './rating-guide'
import {
  impliedRating,
  raisedRating,
  type ImplicationRules,
  type ImpliedRating,
} from '../../../shared/implications'
import { useImplications } from '../implications'
import type { AppStatus, StagedFile, StageOutcome, UploadResult } from '../../../shared/api'

type Status = 'ready' | 'uploading' | 'ok' | 'error' | 'duplicate'

type Staged = {
  file: StagedFile
  tags: TagSeed[]
  rating: Rating
  sourceUrl: string
  status: Status
  message?: string
  postId?: number
  /**
   * What the post actually came out carrying, read back from the board rather than
   * assumed from what was sent. The rules add tags at upload and the pipeline dedupes, so
   * the list that went up is not quite the list that landed — and this exists to be
   * checked, which a copy of the request could not do.
   */
  postTags?: TagSeed[]
  /**
   * The post already holding these bytes, found when the file was staged rather than when
   * it was uploaded. A row like this is a notice: there is no post to make from it, so
   * there is nothing to tag it with either.
   */
  duplicateOf?: number
}

/**
 * The rule that has something to say about this image's rating, or null. Shared by the
 * floor and by the note under the select, so the form can never obey one rule and blame
 * another.
 */
function ratingRule(tags: TagSeed[], rules: ImplicationRules): ImpliedRating | null {
  return impliedRating(
    tags.map((tag) => tag.name),
    rules
  )
}

/**
 * Why the rating is what it is. A rating that moves on its own is the one change nobody
 * watched happen — the tag box is where you were looking — so the form names the rule
 * rather than leaving you to guess which of eight tags did it, or whether the app simply
 * lost your rating.
 *
 * Worded as what the rule *asks for*, which stays true whether the image is sitting on
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
 * The uploader: **one image at a time**, staged, tagged, rated and sent.
 *
 * It was a queue — drop a folder, tag twenty cards, upload top to bottom — with reorder
 * arrows, a fold on every card, a done tick and a bar that wrote one set of fields across
 * the whole list. All of that was machinery for keeping twenty half-tagged images
 * straight, and every piece of it was a way of not looking at the picture in front of you.
 * Tagging is the slow part and it is per image; a queue only postponed it, and what it
 * bought — one press of Upload for twenty posts — was worth less than what it cost:
 * twenty cards' worth of state that nothing wrote down, one card on screen at a time
 * anyway once the fields were open, and a close dialog counting work that had no other
 * home.
 *
 * So: one picture, its fields under it, Upload, and the post it made. Dropping several
 * files takes the first and says so.
 *
 * Nothing is created until Upload is pressed, so the image can be previewed, tagged, rated
 * and given a source first — or thrown away and another one dropped.
 *
 * Two things differ from the web's own uploader, both because the file is already on this
 * machine. Staging is a round trip to the main process, which decodes the image to make
 * the preview and settles the size, the dimensions and the format before anything appears
 * — the web can only measure bytes. And the path is the only thing held here: the bytes
 * are read at upload time, on the other side of the bridge, so a 40MB image is never
 * copied into the window at all.
 */
export function UploadForm({
  status,
  onReview,
}: {
  status: AppStatus
  /** Open this post in the editor — the way back into a post whose tags need another look. */
  onReview: (postId: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  // What the staging step is doing, or null. A label rather than a flag: reading a
  // picked file and fetching one off the web take visibly different amounts of time.
  const [staging, setStaging] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [item, setItem] = useState<Staged | null>(null)
  // The tag import, open or not.
  const [importing, setImporting] = useState(false)
  /**
   * A question waiting for a yes, or null. Two of them, and they are the same question
   * about the same thing: what is staged was typed by hand and is held nowhere else, so
   * both the ✕ that throws it away and the file that would take its place have to ask
   * first. `next` is what to put there afterwards — nothing, for the ✕.
   *
   * An image with nothing typed into it goes without asking, as a card always did: there
   * is nothing there to confirm.
   */
  const [confirming, setConfirming] = useState<{ next: Staged | null } | null>(null)
  // The rating guide, which is reference rather than a setting — open while tagging, shut
  // the rest of the time.
  const [ratingGuide, setRatingGuide] = useState(false)
  // What the last pick or drop turned away, with the reason main gave, plus the note that
  // says only the first of several files was taken.
  const [refused, setRefused] = useState<string[]>([])
  // Whether the picture is open full-window.
  const [viewing, setViewing] = useState(false)
  // Read here rather than in the field, because this is where a post is made: the fields
  // only show what the rules imply, and `seedsToInput` is what puts it on the upload.
  const rules = useImplications()

  /**
   * What a press of ✕ costs, in the words of what would be lost. An uploaded image is not
   * in it: its tags are on the board, and clearing only stops showing a post that exists.
   */
  const typedWork = useCallback((staged: Staged): string => {
    if (staged.status === 'ok' || staged.status === 'duplicate') return ''
    const typed: string[] = []
    if (staged.tags.length > 0) {
      typed.push(`${staged.tags.length} tag${staged.tags.length === 1 ? '' : 's'}`)
    }
    if (staged.sourceUrl.trim() !== '') typed.push('a source')
    return typed.join(' and ')
  }, [])

  /**
   * An image never reaches the form unless it can actually be uploaded. The main process
   * checks it — readable image, within the size and pixel limits — and hands back either a
   * staged row or the reason it can't be one, which is said out loud rather than
   * discovered halfway through an upload.
   *
   * What is already staged decides where the new one goes: onto the screen, or behind the
   * question above.
   */
  const absorb = useCallback(
    (outcomes: StageOutcome[], extra: string[] = []) => {
      const outcome = outcomes[0]
      if (!outcome) {
        setRefused(extra)
        return
      }
      if (!outcome.ok) {
        setRefused([...extra, `${outcome.name} — ${outcome.error}`])
        return
      }

      setRefused(extra)
      const next: Staged = {
        file: {
          path: outcome.path,
          name: outcome.name,
          size: outcome.size,
          width: outcome.width,
          height: outcome.height,
          preview: outcome.preview,
          md5: outcome.md5,
        },
        tags: [],
        rating: 'g',
        sourceUrl: '',
        status: outcome.duplicateOf !== null ? 'duplicate' : 'ready',
        duplicateOf: outcome.duplicateOf ?? undefined,
      }

      setItem((current) => {
        if (current && typedWork(current) !== '') {
          setConfirming({ next })
          return current
        }
        setViewing(false)
        return next
      })
    },
    [typedWork]
  )

  const stage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      // One image at a time, and the extras are named rather than dropped in silence: a
      // multi-select in the OS picker is a habit from the queue this replaced, and someone
      // who does it should be told what became of the rest.
      const extra =
        paths.length > 1
          ? [`Only the first of ${paths.length} images was taken — upload them one at a time.`]
          : []
      setStaging('Reading image…')
      try {
        absorb(await window.api.stageFiles(paths.slice(0, 1)), extra)
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
      const extra =
        urls.length > 1
          ? [`Only the first of ${urls.length} images was taken — upload them one at a time.`]
          : []
      setStaging('Downloading…')
      try {
        absorb(await window.api.fetchImages(urls.slice(0, 1)), extra)
      } finally {
        setStaging(null)
      }
    },
    [absorb]
  )

  /**
   * The rating an image keeps once its tags have changed. Raise only — `raisedRating` has
   * why — so a rule can lift an image nobody rated and can never undo a rating that was
   * set by hand or earned by a stronger tag.
   */
  const ratingFor = useCallback(
    (tags: TagSeed[], current: Rating): Rating => raisedRating(current, ratingRule(tags, rules)),
    [rules]
  )

  const patch = useCallback((changes: Partial<Staged>) => {
    setItem((current) => (current ? { ...current, ...changes } : current))
  }, [])

  /** Throws away what is staged, and puts whatever asked for its place there instead. */
  const clear = useCallback((next: Staged | null) => {
    setItem(next)
    setConfirming(null)
    setViewing(false)
    setImporting(false)
  }, [])

  /**
   * Copies a post's tags on, merged rather than substituted — what is staged may already
   * carry what is different about this image, and the import is what it has in common with
   * another. The rating floor is re-applied for the same reason the tag field applies it:
   * an imported tag can ask for a rating just as a typed one can.
   */
  const importTags = useCallback(
    (tags: TagSeed[]) => {
      setItem((current) => {
        if (!current) return current
        const merged = [...current.tags]
        for (const tag of tags) {
          if (!merged.some((t) => t.name === tag.name)) merged.push(tag)
        }
        return { ...current, tags: merged, rating: ratingFor(merged, current.rating) }
      })
    },
    [ratingFor]
  )

  async function submit() {
    if (!item || item.status === 'ok' || item.status === 'duplicate') return

    setBusy(true)
    patch({ status: 'uploading', message: undefined, postId: undefined })

    let result: UploadResult
    try {
      result = await window.api.uploadPost({
        path: item.file.path,
        tags: seedsToInput(item.tags, rules),
        rating: item.rating,
        sourceUrl: item.sourceUrl,
      })
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }
    }

    if (result.ok) {
      const postId = result.postId
      patch({ status: 'ok', postId })
      // The post just created tags and moved counts, so the Tags screen's remembered index
      // is out of date, and Browse's grid is missing a post. Dropped rather than re-read:
      // they may never be looked at.
      invalidateTags()
      invalidateBrowse()
      // Awaited, unlike the queue's, which could not wait: there is nothing behind this
      // one, and the list it fills in is the whole point of the screen it lands on.
      const loaded = await window.api.getPost(postId)
      if (loaded) {
        patch({ postTags: loaded.tags.map(({ name, category }) => ({ name, category })) })
      }
    } else {
      patch({ status: 'error', message: result.error, postId: result.existingPostId })
    }
    setBusy(false)
  }

  // Booleans, because there is one image: what main has to decide is whether closing would
  // lose something, and a duplicate is not something — there is no post to make from it
  // and nothing typed into it (`main/close-guard.ts`).
  const staged = item !== null && item.status !== 'ok' && item.status !== 'duplicate'
  const uploaded = item?.status === 'ok'

  // Main can't ask the window what it is holding from inside a `close` handler, so the
  // window tells it as it goes.
  useEffect(() => {
    window.api.reportStaged({ staged, uploaded, busy })
  }, [staged, uploaded, busy])

  // The one thing that takes this component away rather than hiding it is the app closing,
  // and a flag left behind would have main guarding a screen that no longer exists.
  useEffect(() => {
    return () => window.api.reportStaged({ staged: false, uploaded: false, busy: false })
  }, [])

  const working = busy || staging !== null

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
        className="flex min-h-full flex-col gap-4"
      >
        {/* The only thing above the drop zone: the rating is the field whose consequences
            are not on this screen — two of the four tiers decide whether the post is in the
            board's listing at all — so the explanation is one press away from where the
            choice is made. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setRatingGuide(true)}
            title="What the four ratings mean, and what choosing one does"
            className={BUTTON_SM}
          >
            <span aria-hidden>ℹ️</span> About rating
          </button>
        </div>

        {/*
          The drop area shrinks to a strip once there is an image below it to keep room for.
          The whole thing is the button, not just the label inside it: a dashed rectangle
          saying "drop an image" is already the target, and asking for a second, smaller aim
          at the word inside it only made the obvious click miss. One button also means one
          tab stop and one disabled state while staging runs.
        */}
        <button
          type="button"
          onClick={() => void window.api.chooseFiles().then(stage)}
          disabled={working}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed text-center disabled:opacity-50 ${
            item === null ? 'my-auto w-full px-6 py-12' : 'px-4 py-4'
          } ${dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent'}`}
        >
          {item === null && (
            <>
              <p className="text-base font-semibold">Drop an image to upload</p>
              <p className="text-sm text-muted">Tag and rate it, then submit</p>
              <p className="text-xs text-muted">Up to {status.limits.maxFileSizeLabel}</p>
            </>
          )}
          <span className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <span aria-hidden>📂</span>
            {staging ?? (item === null ? 'Browse' : 'Choose another image')}
          </span>
        </button>

        {refused.length > 0 && (
          <ul className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
            {refused.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {item && (
          <div
            className={`flex flex-col gap-3 rounded-lg border bg-surface p-3 ${
              item.status === 'error'
                ? 'border-red-500/40'
                : item.status === 'duplicate'
                  ? 'border-yellow-500/40'
                  : 'border-border'
            }`}
          >
            {/* Name and remove on one line above the picture. */}
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.file.path}>
                  {item.file.name}
                </p>
                <p className="text-xs text-muted">
                  {formatSize(item.file.size)} · {item.file.width}×{item.file.height}
                </p>
              </div>

              <button
                type="button"
                onClick={() => (typedWork(item) === '' ? clear(null) : setConfirming({ next: null }))}
                disabled={busy}
                title="Take this image off the form"
                aria-label={`Take ${item.file.name} off the form`}
                className="flex min-h-9 w-11 shrink-0 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                <TrashIcon />
              </button>
            </div>

            {/* Under the header, so it is where the ✕ that raised it is. The same question
                whether the answer is "nothing takes its place" or "this file does". */}
            {confirming && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <span className="flex-1 text-xs text-red-400">
                  {confirming.next
                    ? `Replace this image with ${confirming.next.file.name}?`
                    : 'Take this image off the form?'}{' '}
                  {typedWork(item)} were typed here and are held nowhere else.
                </span>
                <button
                  type="button"
                  onClick={() => clear(confirming.next)}
                  className="min-h-9 rounded-lg border border-red-500/40 px-3 text-xs text-red-400 hover:bg-red-500/10"
                >
                  {confirming.next ? 'Replace' : 'Remove'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-background"
                >
                  Keep
                </button>
              </div>
            )}

            {/* The thumbnail is the button. `object-contain` on a fixed height: cropping to
                fill would hide exactly the edges that tell two variants of the same image
                apart. Clicking opens the full-window viewer, which is the difference
                between a good look and the actual file. Raise `h-96` and `PREVIEW_HEIGHT`
                in `main/staging.ts` moves with it, or the picture goes soft. */}
            {item.status !== 'duplicate' && (
              <button
                type="button"
                onClick={() => setViewing(true)}
                title="Open a bigger preview"
                aria-label={`Open a bigger preview of ${item.file.name}`}
                className="h-96 w-full shrink-0 overflow-hidden rounded-lg bg-background ring-border hover:ring-2"
              >
                <img
                  src={item.file.preview}
                  alt={item.file.name}
                  className="h-full w-full object-contain"
                />
              </button>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {item.status === 'duplicate' ? (
                <Duplicate
                  siteUrl={status.siteUrl}
                  postId={item.duplicateOf}
                  onReview={onReview}
                  onRemove={() => clear(null)}
                />
              ) : item.status === 'ok' ? (
                <Uploaded
                  siteUrl={status.siteUrl}
                  postId={item.postId}
                  tags={item.postTags}
                  onReview={onReview}
                  onNext={() => clear(null)}
                />
              ) : (
                <>
                  <CategoryTagField
                    value={item.tags}
                    onChange={(tags) => patch({ tags, rating: ratingFor(tags, item.rating) })}
                    actions={
                      // On the TAGS line rather than in a row of its own: it fills that
                      // whole field at once, from a post already tagged the way this one
                      // wants to be, so it belongs to the heading it acts on. Unbordered —
                      // a bordered button above a field of bordered chips read as one of
                      // them.
                      <button
                        type="button"
                        onClick={() => setImporting(true)}
                        disabled={busy}
                        title="Copy the tags from a post on the board"
                        className="flex min-h-7 items-center rounded px-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        <span aria-hidden>📋</span>&nbsp;Import tags from a post
                      </button>
                    }
                    disabled={busy}
                    imply
                    recommend
                    catalogs
                  />

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label className="flex flex-col gap-1.5 text-sm sm:w-44">
                      Rating
                      {/* Coloured closed and open, the same four colours the grid, the
                          board and the post editor use for the scale. */}
                      <select
                        value={item.rating}
                        disabled={busy}
                        onChange={(event) => patch({ rating: event.target.value as Rating })}
                        className={`min-h-11 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-accent ${RATING_COLOR[item.rating]}`}
                      >
                        {RATINGS.map((rating) => (
                          <option
                            key={rating}
                            value={rating}
                            className={`bg-background ${RATING_COLOR[rating]}`}
                          >
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
                        onChange={(event) => patch({ sourceUrl: event.target.value })}
                        placeholder="https://…"
                        className="min-h-11 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-accent"
                      />
                    </label>
                  </div>

                  <RatingNote rule={ratingRule(item.tags, rules)} />

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
          </div>
        )}

        {staged && (
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background py-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={working}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-background disabled:opacity-50"
            >
              {busy ? 'Compressing and uploading…' : 'Upload'}
            </button>
          </div>
        )}
      </div>

      {/* Outside the drop zone on purpose: a full-window overlay sitting inside it would
          answer the drag handlers with its own hit box while it is up. */}
      {viewing && item && (
        <ImageViewer key={item.file.path} file={item.file} onClose={() => setViewing(false)} />
      )}

      {ratingGuide && <RatingGuide onClose={() => setRatingGuide(false)} />}

      {importing && (
        <TagImport
          onImport={(tags) => {
            importTags(tags)
            setImporting(false)
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  )
}

/**
 * An image that is already on the board. Its md5 is settled at staging
 * (`main/staging.ts`), so this is known before anything is typed — which is the point of
 * checking there rather than letting the upload find out: tagging a post that cannot be
 * made is the only work this screen can waste.
 *
 * No form, then, and no picture either: what is left to decide is whether to look at the
 * post that already exists, and whether to keep this on screen at all.
 */
function Duplicate({
  siteUrl,
  postId,
  onReview,
  onRemove,
}: {
  siteUrl: string
  postId: number | undefined
  onReview: (postId: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-3 text-sm text-yellow-300">
        <span>
          <span aria-hidden>⚠ </span>
          Already on the board as post #{postId}
        </span>
        {postId !== undefined && (
          <>
            <PostLink siteUrl={siteUrl} postId={postId} label="Open on the board" />
            <button
              type="button"
              onClick={() => onReview(postId)}
              title="Open that post in the editor"
              className={BUTTON_SM}
            >
              ✏️ Review tags
            </button>
          </>
        )}
      </p>
      <p className="text-xs text-muted">
        The same bytes are the same post — there is nothing here to upload.
      </p>
      <div className="flex">
        <button
          type="button"
          onClick={onRemove}
          className="min-h-9 rounded-lg border border-border px-3 text-xs transition-colors hover:bg-background"
        >
          Take it off the form
        </button>
      </div>
    </div>
  )
}

/**
 * A finished upload. It says what landed rather than only that something did: the tags the
 * post actually carries, read back from the board, and a way straight into the editor.
 *
 * Both because this is the moment tagging is checked. A tag that was meant to go on and
 * did not is invisible from a line that only says "Uploaded", and this is where you still
 * remember what the picture was supposed to be tagged — ten uploads later it is a search
 * to find again.
 */
function Uploaded({
  siteUrl,
  postId,
  tags,
  onReview,
  onNext,
}: {
  siteUrl: string
  postId: number | undefined
  tags: TagSeed[] | undefined
  onReview: (postId: number) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-3 text-sm">
        <PostLink siteUrl={siteUrl} postId={postId} label={`Uploaded — post #${postId}`} />
        {postId !== undefined && (
          <button
            type="button"
            onClick={() => onReview(postId)}
            title="Open this post in the editor"
            className={BUTTON_SM}
          >
            ✏️ Review tags
          </button>
        )}
        {/* The way on, beside the way back into what was just made — the two things there
            are to do here, and neither of them is scrolling. */}
        <button
          type="button"
          onClick={onNext}
          title="Clear this and stage another image"
          className={BUTTON_SM}
        >
          ➕ Upload another
        </button>
      </p>

      {tags === undefined ? (
        <p className="text-xs text-muted">Reading its tags…</p>
      ) : tags.length === 0 ? (
        <p className="text-xs text-muted">No tags — nothing will find this post.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.name}
              className={`rounded bg-surface px-2 py-0.5 font-mono text-xs ${categoryColor(tag.category)}`}
            >
              {tagLabel(tag.name)}
            </span>
          ))}
        </div>
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
