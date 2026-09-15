import { useCallback, useState } from 'react'
import type { StageOutcome } from '../../../shared/api'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD } from './panel'

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
  // post, so the address is the same for all of them and typing it four times is typing it three times too often. It survives the
  // upload rather than being cleared with the staged files — the next drop is very often
  // the next post by the same artist, and a box you have to re-empty is cheaper than one
  // you have to re-fill. Correcting one image's source afterwards is its own panel.
  const [source, setSource] = useState('')
  const [working, setWorking] = useState<string | null>(null)

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
      })
      results.push(
        result.ok
          ? { name: file.name, ok: true, message: `added as #${result.postId}` }
          : { name: file.name, ok: false, message: result.error }
      )
    }
    setWorking(null)
    setStaged([])
    setLanded(results)
    // The grid is now missing whatever landed, and the shelf's cover has moved.
    onUploaded()
  }

  return {
    staged,
    setStaged,
    rejected,
    landed,
    source,
    setSource,
    working,
    stage,
    stageUrls,
    upload,
  }
}

/** What the hook returns, which is the whole of the box's state. */
type Staging = ReturnType<typeof useStaging>

/**
 * The drop zone and the batch under it: files and one source. An image's rating is its
 * shelf's, so there is nothing else to say about a batch.
 */
export function StagingBox({
  staging,
  name,
  dragging,
}: {
  staging: Staging
  /** The shelf's name, which the Upload button says out loud: it is the one press here
   *  that cannot be taken back, and the screen it is on is not always the one you meant. */
  name: string
  dragging: boolean
}) {
  const { staged, setStaged, rejected, landed, source, setSource, working } = staging

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
