import { useState } from 'react'
import type { Artist, ArtistImage } from '../../../shared/api'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { ArtistThumb } from './artist-images'
import { ArtistKindSwitch } from './artist-kind'
import { imageUrlsFrom } from './image-urls'
import { LinkPill } from './link-pill'
import { FIELD } from './panel'
import type { StageOutcome } from '../../../shared/api'

/**
 * Everything that changes one artist: the name, the addresses, the examples, and the way to
 * remove the artist altogether.
 *
 * Every control writes on use, as the post editor's do, and asks the list to re-read after —
 * the list is what is drawn, so that is the one copy worth keeping true.
 */
export function ArtistEditor({
  artist,
  onChanged,
  onKindChanged,
  onArchive,
  onDeleted,
  onView,
}: {
  artist: Artist
  onChanged: () => void
  onKindChanged: (isAi: boolean) => void
  /** Absent for an artist already archived — the card's Unarchive is the way back. */
  onArchive?: () => void
  onDeleted: () => void
  onView: (image: ArtistImage) => void
}) {
  const [name, setName] = useState(artist.name)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState(false)

  /** Runs a write, showing its refusal or re-reading the list on success. */
  async function run(write: Promise<{ ok: true } | { ok: false; error: string }>) {
    const result = await write
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    onChanged()
    return true
  }

  /**
   * Staged, then uploaded one at a time. Staging is where a duplicate is caught — "already an
   * example for …" before an encode, not after — and a browser drag is downloaded there too.
   * Sequential, because each upload is a full encode already spread across the cores.
   */
  async function addImages(staging: Promise<StageOutcome[]>) {
    setWorking('Reading…')
    const refused: string[] = []
    try {
      const outcomes = await staging
      const ready = outcomes.filter((outcome) => {
        if (!outcome.ok) refused.push(`${outcome.name}: ${outcome.error}`)
        else if (outcome.duplicateOf !== null) {
          refused.push(
            `${outcome.name}: already an example for ${outcome.duplicateIn ?? 'an artist'}`
          )
        } else return true
        return false
      })
      for (const [at, file] of ready.entries()) {
        setWorking(`Uploading ${at + 1} of ${ready.length}…`)
        const result = await window.api.uploadArtistImage(artist.id, file.path)
        if (!result.ok) refused.push(`${file.name}: ${result.error}`)
      }
      if (ready.length > 0) onChanged()
    } finally {
      setWorking(null)
      setError(refused.length > 0 ? refused.join('\n') : null)
    }
  }

  async function destroy() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    const result = await window.api.deleteArtist(artist.id)
    if (result.ok) onDeleted()
    else setError(result.error)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        // Read out of dataTransfer now: it is emptied the moment this handler returns.
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => window.api.pathForFile(file))
          .filter(Boolean)
        if (paths.length > 0) {
          void addImages(window.api.stageFiles(paths, 'artist'))
          return
        }
        const urls = imageUrlsFrom(event.dataTransfer)
        if (urls.length > 0) void addImages(window.api.fetchImages(urls, 'artist'))
      }}
      className={`flex flex-col gap-3 rounded-lg border-2 border-dashed px-3 py-3 ${
        dragging ? 'border-accent bg-accent/10' : 'border-border'
      }`}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === artist.name) return
          void window.api.renameArtist(artist.id, name).then((result) => {
            if (result.ok) setName(result.name)
            return run(Promise.resolve(result))
          })
        }}
        className="flex items-center gap-2"
      >
        <label className="text-xs text-muted" htmlFor={`artist-name-${artist.id}`}>
          Name
        </label>
        <input
          id={`artist-name-${artist.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${FIELD} min-w-0 flex-1`}
        />
        <button type="submit" className={BUTTON_SUBMIT_ON_SURFACE}>
          <span aria-hidden>✅</span> Rename
        </button>
        {/* Written on the press, like every control here. */}
        <ArtistKindSwitch
          isAi={artist.is_ai}
          label="AI or not"
          onChange={(next) => {
            if (next === artist.is_ai) return
            void window.api.setArtistAi(artist.id, next).then((result) => {
              if (!result.ok) {
                setError(result.error)
                return
              }
              setError(null)
              onKindChanged(next)
            })
          }}
        />
      </form>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Links</h3>
        {artist.urls.map((link) => (
          <div key={link.id} className="flex items-center gap-2 text-xs">
            <LinkPill url={link.url} full />
            <button
              type="button"
              onClick={() => void run(window.api.removeArtistUrl(link.id))}
              title="Remove this link"
              aria-label={`Remove ${link.url}`}
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void window.api.addArtistUrl(artist.id, url).then(async (result) => {
              if (await run(Promise.resolve(result))) setUrl('')
            })
          }}
          className="flex items-center gap-2"
        >
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.pixiv.net/users/212801"
            spellCheck={false}
            className={`${FIELD} min-w-0 flex-1`}
          />
          <button type="submit" className={BUTTON_SUBMIT_ON_SURFACE}>
            <span aria-hidden>🔗</span> Add link
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Examples</h3>
          <button
            type="button"
            onClick={() =>
              void window.api.chooseFiles().then((paths) => {
                if (paths.length > 0) void addImages(window.api.stageFiles(paths, 'artist'))
              })
            }
            disabled={working !== null}
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>📥</span> Add images
          </button>
          <span className="text-xs text-muted">{working ?? 'or drop them here'}</span>
        </div>
        {artist.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {artist.images.map((image) => (
              <ArtistThumb
                key={image.id}
                image={image}
                onOpen={() => onView(image)}
                onRemove={() => void run(window.api.deleteArtistImage(image.id))}
              />
            ))}
          </div>
        )}
      </div>

      {error && <p className="whitespace-pre-line text-xs text-[#ff5d5f]">{error}</p>}

      <div className="flex justify-end gap-1">
        {/* Here rather than on the card: archiving is decided about an artist every so
            often, not a thing to have within reach on every pass down the list. One press,
            since Unarchive puts it straight back. */}
        {onArchive && (
          <button type="button" onClick={onArchive} className={BUTTON_ON_SURFACE}>
            <span aria-hidden>🗄️</span> Archive
          </button>
        )}
        {/* Two presses: this takes the links, the examples and their stored files with it. */}
        <button
          type="button"
          onClick={() => void destroy()}
          onBlur={() => setConfirming(false)}
          className={BUTTON_ON_SURFACE}
        >
          <span aria-hidden>🗑️</span>{' '}
          {confirming
            ? `Really delete ${artist.name} and ${artist.images.length} example${artist.images.length === 1 ? '' : 's'}`
            : 'Delete artist'}
        </button>
      </div>
    </div>
  )
}
