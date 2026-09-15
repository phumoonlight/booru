import { useState } from 'react'
import type { Artist, ArtistImage } from '../../../shared/api'
import { BUTTON_ON_SURFACE } from './buttons'
import { ArtistEditor } from './artist-editor'
import { ArtistThumb } from './artist-images'
import { HoldButton } from './hold-button'
import { LinkPill } from './link-pill'

const DAY_MS = 24 * 60 * 60 * 1000

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** "12 Sep 2026 · 3 days ago". Days, not hours: this is a list you come back to over
 *  weeks, and "19 hours ago" is precision nobody is sorting by. */
function dateLabel(iso: string, now = Date.now()): string {
  const at = new Date(iso)
  const days = Math.floor((now - at.getTime()) / DAY_MS)
  const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return `${DATE.format(at)} · ${ago}`
}

/**
 * One artist: name, when they were last read, where they post, and what their work looks
 * like. ✏️ Edit opens the editor inside the card, so the row being changed stays the row on
 * screen.
 */
export function ArtistCard({
  artist,
  editing,
  onToggleEdit,
  onRead,
  onChanged,
  onKindChanged,
  onArchived,
  onFavorited,
  onDeleted,
  onView,
}: {
  artist: Artist
  editing: boolean
  onToggleEdit: () => void
  onRead: (readAt: string) => void
  onChanged: () => void
  onKindChanged: (isAi: boolean) => void
  /** Into the archive or out of it, with the stamp as stored — null is back on the list. */
  onArchived: (archivedAt: string | null) => void
  /** Onto the favourites or back onto the reading list. */
  onFavorited: (isFavorite: boolean) => void
  onDeleted: () => void
  onView: (image: ArtistImage) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [marking, setMarking] = useState(false)
  const archived = artist.archived_at !== null

  async function setArchived(next: boolean) {
    const result = await window.api.setArtistArchived(artist.id, next)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onArchived(result.archived_at)
  }

  async function setFavorite(next: boolean) {
    const result = await window.api.setArtistFavorite(artist.id, next)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onFavorited(next)
  }

  async function markRead() {
    setMarking(true)
    const result = await window.api.markArtistRead(artist.id)
    setMarking(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onRead(result.read_at)
  }

  return (
    <section
      className={`flex flex-col gap-2 rounded-lg border bg-surface px-3 py-3 ${
        editing ? 'border-accent' : 'border-border'
      }`}
    >
      {/* Three columns, the outer two equal, so the middle one sits on the card's centre
          whatever the name and the date add up to. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold">{artist.name}</h2>
          {artist.archived_at !== null ? (
            // The archive's date leads, being what that list is ordered by; the last read
            // stays beside it, quieter, as the record of when this artist was last followed.
            <>
              <span className="text-xs text-accent">Archived {dateLabel(artist.archived_at)}</span>
              <span className="text-xs text-muted">
                {artist.read_at
                  ? `last read ${DATE.format(new Date(artist.read_at))}`
                  : 'never read'}
              </span>
            </>
          ) : (
            <span className={`text-xs ${artist.read_at ? 'text-muted' : 'text-accent'}`}>
              {artist.read_at ? dateLabel(artist.read_at) : 'Never read'}
            </span>
          )}
        </div>
        {archived ? (
          // A click, not a hold: the editor's Archive puts it straight back, and nothing
          // about the artist's place in either list is lost by it.
          <button
            type="button"
            onClick={() => void setArchived(false)}
            title="Back onto the reading list"
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>📤</span> Unarchive
          </button>
        ) : (
          // Held, not clicked: it has no undo and it sends the card to the bottom of the
          // list, out from under the pointer — so a stray click must not reach it.
          <HoldButton
            onHold={() => void markRead()}
            disabled={marking}
            title="Hold to mark as read now"
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>👁️</span> {marking ? 'Marking…' : 'Hold to mark read'}
          </HoldButton>
        )}
        <button
          type="button"
          onClick={onToggleEdit}
          aria-pressed={editing}
          className={`${BUTTON_ON_SURFACE} justify-self-end`}
        >
          <span aria-hidden>{editing ? '✅' : '✏️'}</span> {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Editing draws both lists again with a ✕ on every entry, so they are not drawn twice. */}
      {!editing && artist.urls.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {artist.urls.map((link) => (
            <li key={link.id} className="min-w-0">
              <LinkPill url={link.url} />
            </li>
          ))}
        </ul>
      )}

      {!editing && artist.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {artist.images.map((image) => (
            <ArtistThumb key={image.id} image={image} onOpen={() => onView(image)} />
          ))}
        </div>
      )}

      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}

      {editing && (
        <ArtistEditor
          artist={artist}
          onChanged={onChanged}
          onKindChanged={onKindChanged}
          onArchive={archived ? undefined : () => void setArchived(true)}
          onFavorite={archived ? undefined : () => void setFavorite(!artist.is_favorite)}
          onDeleted={onDeleted}
          onView={onView}
        />
      )}
    </section>
  )
}
