import { useState } from 'react'
import { boardLabel, useBoard } from '../board-store'
import { BUTTON_SM } from './buttons'
import { TrashIcon } from './icons'
import { ImageViewer } from './image-viewer'
import { TagImport } from './tag-import'
import { RatingGuide } from './rating-guide'
import { imageUrlsFrom } from './image-urls'
import { useUploadItem } from './upload-item'
import { UploadFields } from './upload-fields'
import { Duplicate, Uploaded } from './upload-result'
import type { AppStatus } from '../../../shared/api'

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
  // Which board an upload from this screen lands on. Read as state so the button below
  // repaints when the header's switch moves; the press itself reads the store again, so
  // what is sent cannot be a render behind what is drawn.
  const board = useBoard()
  const [dragging, setDragging] = useState(false)
  // The tag import, open or not.
  const [importing, setImporting] = useState(false)
  // The rating guide, which is reference rather than a setting — open while tagging, shut
  // the rest of the time.
  const [ratingGuide, setRatingGuide] = useState(false)
  // Whether the picture is open full-window.
  const [viewing, setViewing] = useState(false)
  // Everything about the image itself. Whatever takes it away closes what is over the top
  // of it, which is the one thing the hook cannot know about.
  const {
    item,
    staging,
    busy,
    refused,
    confirming,
    setConfirming,
    typedWork,
    stage,
    stageUrls,
    patch,
    clear,
    importTags,
    submit,
    staged,
    working,
    rule,
  } = useUploadItem(() => {
    setViewing(false)
    setImporting(false)
  })

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
            are not on this screen — one of the two tiers decides whether the post is in the
            board's listing at all — so the explanation is one press away from where the
            choice is made. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setRatingGuide(true)}
            title="What the two ratings mean, and what choosing one does"
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
                onClick={() =>
                  typedWork(item) === '' ? clear(null) : setConfirming({ next: null })
                }
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
                <UploadFields
                  item={item}
                  rule={rule}
                  busy={busy}
                  siteUrl={status.siteUrl}
                  onChange={patch}
                  onImport={() => setImporting(true)}
                />
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
              {/* The board is named on the button, not only in the header switch. This is
                  the press that cannot be taken back — the post is made, the files are
                  stored — and "Upload" alone was true when there was one board to upload
                  to. The switch is across the window from here, which is exactly the
                  distance at which nobody re-reads it. */}
              {busy ? 'Compressing and uploading…' : `Upload to ${boardLabel(board).toLowerCase()}`}
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
