import { useCallback, useState } from 'react'
import type { CollectionTag, StageOutcome } from '../../../shared/api'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE, tagPill } from './buttons'
import { FIELD } from './panel'
import { TagMark } from './tag-mark'
import { tagLabel } from '@common/search'

/** One staged file, on its way onto a shelf. */
type Staged = Extract<StageOutcome, { ok: true }>

/** What happened to one of them once Upload was pressed. */
type Landed = { name: string; ok: boolean; message: string }

/**
 * Everything about putting images on a shelf: what has been dropped, what was refused,
 * what the batch's source is, and the upload itself.
 *
 * A hook and a box rather than one component, because the drop target is the whole screen
 * — the files arrive at the view's own `onDrop` and have to reach the batch that is being
 * assembled down here. The view calls this, hands the box back what it returns, and passes
 * `stage`/`stageUrls` whatever was let go over it.
 */
export function useStaging(collectionId: number, onUploaded: () => void) {
  const [staged, setStaged] = useState<Staged[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [landed, setLanded] = useState<Landed[]>([])
  // One source for the batch: the images that arrive together are usually the four in one
  // post, so the address is the same for all of them and typing it four times is typing it
  // three times too often. It is cleared with the staged files once the batch has landed —
  // it belonged to those images, and a box still holding the last post's address is how the
  // next batch quietly gets the wrong source. Correcting one afterwards is its own panel.
  const [source, setSource] = useState('')
  // The shelf's tags the batch lands carrying, by id — one pass instead of a trip through
  // every image's panel afterwards. Cleared with the source, for the source's reason.
  const [tagIds, setTagIds] = useState<number[]>([])
  const [working, setWorking] = useState<string | null>(null)

  const toggleTag = useCallback((id: number) => {
    setTagIds((current) =>
      current.includes(id) ? current.filter((held) => held !== id) : [...current, id]
    )
  }, [])

  /** Takes what a picker or a drop produced and sorts it into "can be uploaded" and "here
   *  is why not" — a duplicate names the shelf it is already on, which is the answer
   *  somebody can act on. */
  const absorb = useCallback((outcomes: StageOutcome[]) => {
    const ready: Staged[] = []
    const refused: string[] = []
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        refused.push(`${outcome.name}: ${outcome.error}`)
      } else if (outcome.duplicateOf !== null) {
        refused.push(`${outcome.name}: already in ${outcome.duplicateIn ?? 'another collection'}`)
      } else {
        ready.push(outcome)
      }
    }
    setStaged((current) => [
      ...current,
      // The same file dropped twice is one image, and the md5 says so before anything is
      // uploaded — the board's own check would say it afterwards, one encode later.
      ...ready.filter((next) => !current.some((held) => held.md5 === next.md5)),
    ])
    setRejected(refused)
    setLanded([])
  }, [])

  const stage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setWorking(`Reading ${paths.length} image${paths.length === 1 ? '' : 's'}…`)
      try {
        absorb(await window.api.stageFiles(paths, 'collection'))
      } finally {
        setWorking(null)
      }
    },
    [absorb]
  )

  const stageUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return
      setWorking('Downloading…')
      try {
        absorb(await window.api.fetchImages(urls, 'collection'))
      } finally {
        setWorking(null)
      }
    },
    [absorb]
  )

  /**
   * Uploads the batch, one file at a time and in order.
   *
   * Sequential because each of these is a full encode and libvips already spreads one
   * across the cores this app is allowed (`main/cpu.ts`) — running four at once would only
   * make the first finish later. Each answer is kept, so a failure in the middle is a line
   * beside that file rather than the end of the run.
   */
  async function upload() {
    if (staged.length === 0) return
    const results: Landed[] = []
    for (const [at, file] of staged.entries()) {
      setWorking(`Uploading ${at + 1} of ${staged.length}…`)
      const result = await window.api.uploadToCollection({
        collectionId,
        path: file.path,
        sourceUrl: source.trim(),
        tagIds,
      })
      results.push(
        result.ok
          ? { name: file.name, ok: true, message: `added as #${result.postId}` }
          : { name: file.name, ok: false, message: result.error }
      )
    }
    setWorking(null)
    setStaged([])
    setSource('')
    setTagIds([])
    setLanded(results)
    // The grid is now missing whatever landed, the shelf's cover has moved, and the tags
    // the batch carried have new counts.
    onUploaded()
  }

  return {
    staged,
    setStaged,
    rejected,
    landed,
    source,
    setSource,
    tagIds,
    toggleTag,
    working,
    stage,
    stageUrls,
    upload,
  }
}

/** What the hook returns, which is the whole of the box's state. */
type Staging = ReturnType<typeof useStaging>

/**
 * The drop zone and the batch under it: files, one source and the shelf's tags to carry. An
 * image's rating is its shelf's, so there is nothing else to say about a batch.
 */
export function StagingBox({
  staging,
  name,
  tags,
  dragging,
}: {
  staging: Staging
  /** The shelf's name, which the Upload button says out loud: it is the one press here
   *  that cannot be taken back, and the screen it is on is not always the one you meant. */
  name: string
  /** The shelf's own tags. A new one is made on the tag bar above, never here. */
  tags: CollectionTag[]
  dragging: boolean
}) {
  const { staged, setStaged, rejected, landed, source, setSource, tagIds, working } = staging

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border-2 border-dashed px-4 py-4 ${
        dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void window.api.chooseFiles().then(staging.stage)}
          disabled={working !== null}
          className={BUTTON_ON_SURFACE}
        >
          <span aria-hidden>📥</span> Add images
        </button>
        <span className="text-xs text-muted">or drop them here</span>
      </div>

      {/* The batch's source, on its own line: this is a URL, and sharing a row would leave
          it a stub you cannot read what you pasted into. The placeholder says every, because
          that is the one thing somebody adding a second set of images from a different post
          has to notice. */}
      <label className="flex items-center gap-2 text-xs text-muted">
        Source
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="https://x.com/… — applied to every image in this batch"
          spellCheck={false}
          className={`${FIELD} min-w-0 flex-1 bg-background`}
        />
        {source !== '' && (
          <button
            type="button"
            onClick={() => setSource('')}
            title="Clear the source"
            aria-label="Clear the source"
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>✕</span>
          </button>
        )}
      </label>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Tags</span>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => staging.toggleTag(tag.id)}
              // A running batch took its tags when Upload was pressed, and clears them when it
              // lands — a pill pressed in between would be dropped without having been used.
              disabled={working !== null}
              aria-pressed={tagIds.includes(tag.id)}
              className={tagPill(tagIds.includes(tag.id))}
            >
              <TagMark mark={tag.mark} />
              {tagLabel(tag.name)}
            </button>
          ))}
        </div>
      )}

      {working && <p className="text-xs text-muted">{working}</p>}

      {staged.length > 0 && (
        <>
          <ul className="flex flex-wrap gap-2">
            {staged.map((file) => (
              <li key={file.md5} className="relative">
                <img
                  src={file.preview}
                  alt=""
                  title={file.name}
                  className="size-20 rounded-lg bg-background object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setStaged((current) => current.filter((held) => held.md5 !== file.md5))
                  }
                  title={`Leave out ${file.name}`}
                  aria-label={`Leave out ${file.name}`}
                  className="absolute right-0 top-0 rounded-lg bg-background/80 px-1 text-xs"
                >
                  <span aria-hidden>✕</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void staging.upload()}
              disabled={working !== null}
              className={BUTTON_SUBMIT_ON_SURFACE}
            >
              <span aria-hidden>⬆️</span> Upload {staged.length} to {name}
            </button>
            <button
              type="button"
              onClick={() => setStaged([])}
              disabled={working !== null}
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>🧹</span> Clear
            </button>
          </div>
        </>
      )}

      {rejected.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-[#ff5d5f]">
          {rejected.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {landed.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs">
          {landed.map((result) => (
            <li key={result.name} className={result.ok ? 'text-muted' : 'text-[#ff5d5f]'}>
              {result.name}: {result.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
