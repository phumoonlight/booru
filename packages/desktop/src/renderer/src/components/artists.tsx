import { useCallback, useEffect, useState } from 'react'
import type { Artist, ArtistImage } from '../../../shared/api'
import { BUTTON, BUTTON_SUBMIT_ON_SURFACE, buttonToggle } from './buttons'
import { ArtistCard } from './artist-card'
import { ArtistImageViewer } from './artist-images'
import { ArtistKindSwitch, ArtistListSwitch } from './artist-kind'
import { FIELD, Panel } from './panel'

/**
 * 🎨 Artists: a reading list of the people whose work is worth going back to.
 *
 * **Kept apart from every other feature.** The board switch does nothing here, no tag is
 * involved, and nothing about an artist reaches the website — `booru_web` holds no grant on
 * the tables. It is the desktop app's alone.
 *
 * **The order is the feature.** Never-read first, then oldest read to newest: the artist at
 * the top is the one most overdue a visit, and marking one read sends them to the bottom.
 * There is no read/unread flag — how far behind you are is a date, and a boolean beside it
 * would be a second answer that could disagree with the first.
 *
 * **Two lists, one at a time: non-AI and AI.** The switch in the title row picks which, and
 * opens on non-AI. Each keeps its own order; search narrows within the one on screen.
 *
 * **And an archive beside the reading list**, split the same two ways: artists no longer
 * posting, kept for the record. Newest archived first; they cannot be marked read, and
 * Unarchive puts them back where their last read says.
 */

/** The last list read. The view unmounts whenever another is in front of it, and coming
 *  back to a blank screen while the same rows are re-read would be a flash for nothing. */
let held: Artist[] | null = null

function remember(rows: Artist[]): Artist[] {
  held = rows
  return rows
}

/** Which list is on screen. Survives a trip to another view, not a restart — it is a fact
 *  about a session, like the board switch, and the window opens on non-AI. */
let showingAi = false

function rememberKind(isAi: boolean): boolean {
  showingAi = isAi
  return isAi
}

/** Whether the archive is on screen rather than the reading list — kept like the kind. */
let showingArchive = false

function rememberArchive(archive: boolean): boolean {
  showingArchive = archive
  return archive
}

/** The archive's order: most recently archived first, which is the one you are most likely
 *  to be looking for. ISO strings compare as dates. */
function byArchivedDate(a: Artist, b: Artist): number {
  const at = a.archived_at ?? ''
  const bt = b.archived_at ?? ''
  if (at === bt) return a.id - b.id
  return at < bt ? 1 : -1
}

/** The list's order, applied locally after a mark so the card moves without a re-read. The
 *  query orders the same way (`listArtists`); ISO strings compare as dates. */
function byReadDate(a: Artist, b: Artist): number {
  if (a.read_at === b.read_at) return a.id - b.id
  if (a.read_at === null) return -1
  if (b.read_at === null) return 1
  return a.read_at < b.read_at ? -1 : 1
}

/**
 * Whether an artist answers what was typed: a piece of the name, or a piece of any of their
 * addresses — the handle you remember is often the one in a pixiv or X URL rather than the
 * name the row was saved under. Case-insensitive, and the list keeps its order.
 */
function matches(artist: Artist, typed: string): boolean {
  return (
    artist.name.toLowerCase().includes(typed) ||
    artist.urls.some((link) => link.url.toLowerCase().includes(typed))
  )
}

export function Artists() {
  const [artists, setArtists] = useState<Artist[]>(held ?? [])
  const [loading, setLoading] = useState(held === null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [viewing, setViewing] = useState<ArtistImage | null>(null)
  const [search, setSearch] = useState('')
  const [isAi, setIsAi] = useState(showingAi)
  // What a new artist is saved as. Follows the list on screen until the form says otherwise,
  // since the list you are looking at is almost always the one you are adding to.
  const [newIsAi, setNewIsAi] = useState(showingAi)
  const [archive, setArchive] = useState(showingArchive)

  const typed = search.trim().toLowerCase()
  const onList = artists.filter((artist) => (artist.archived_at !== null) === archive)
  const ofKind = (archive ? [...onList].sort(byArchivedDate) : onList).filter(
    (artist) => artist.is_ai === isAi
  )
  const shown = typed ? ofKind.filter((artist) => matches(artist, typed)) : ofKind

  const showKind = (next: boolean) => {
    setIsAi(rememberKind(next))
    setNewIsAi(next)
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setArtists(remember(await window.api.listArtists()))
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    void window.api.listArtists().then((rows) => {
      if (!alive) return
      setArtists(remember(rows))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  async function create() {
    const result = await window.api.createArtist(name, newIsAi)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName('')
    setNaming(false)
    setError(null)
    // Onto the list it was saved to, or the editor opened below would be on a list that is
    // not on screen — which also means off the archive, since a new artist is never on it.
    showKind(newIsAi)
    setArchive(rememberArchive(false))
    // Straight into its editor: an artist is named because there are links and examples
    // to put on it. Never read, so it lands at the top, where the editor is on screen.
    setEditing(result.id)
    await refresh()
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold tracking-tight">🎨 Artists</h1>
        <span className="text-xs text-muted">
          {loading
            ? 'reading…'
            : typed
              ? `${shown.length} of ${ofKind.length}`
              : `${ofKind.length} artist${ofKind.length === 1 ? '' : 's'}`}
        </span>
        <ArtistListSwitch
          archive={archive}
          onChange={(next) => {
            setArchive(rememberArchive(next))
            setEditing(null)
          }}
        />
        <ArtistKindSwitch isAi={isAi} onChange={showKind} label="Which artists to show" />
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => {
              setNaming((was) => !was)
              setError(null)
            }}
            aria-pressed={naming}
            className={buttonToggle(naming)}
          >
            <span aria-hidden>➕</span> New artist
          </button>
        </div>
      </div>

      {/* The Tags screen's toolbar: reload at the head of the row, then the box filling the
          rest. The list is already in memory, so it narrows on every keystroke with no read. */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void refresh()} disabled={loading} className={BUTTON}>
          <span aria-hidden className={`transition-opacity ${loading ? 'opacity-30' : ''}`}>
            🔄
          </span>
          Refresh
        </button>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search artists"
          placeholder="hiten"
          spellCheck={false}
          className={`${FIELD} min-w-0 flex-1`}
        />
      </div>

      {naming && (
        <Panel title="New artist">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
            className="flex items-center gap-2"
          >
            <ArtistKindSwitch isAi={newIsAi} onChange={setNewIsAi} label="Save as" />
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Hiten"
              className={`${FIELD} flex-1`}
            />
            <button type="submit" className={BUTTON_SUBMIT_ON_SURFACE}>
              <span aria-hidden>✅</span> Create
            </button>
          </form>
          {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
        </Panel>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading
            ? 'Loading…'
            : typed
              ? `No artist matches ${search.trim()}.`
              : archive
                ? `No archived ${isAi ? 'AI ' : ''}artists.`
                : `No ${isAi ? 'AI ' : ''}artists yet. ➕ New artist adds one.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((artist) => (
            <li key={artist.id}>
              <ArtistCard
                artist={artist}
                editing={editing === artist.id}
                onToggleEdit={() => setEditing((was) => (was === artist.id ? null : artist.id))}
                // From the rows as they are when the mark lands, not as they were when the
                // hold began — a refresh can arrive in between.
                onRead={(readAt) =>
                  setArtists((rows) =>
                    remember(
                      rows
                        .map((row) => (row.id === artist.id ? { ...row, read_at: readAt } : row))
                        .sort(byReadDate)
                    )
                  )
                }
                onChanged={() => void refresh()}
                // The list follows the artist across, with the editor still open, so the
                // change is seen landing rather than looking like the row was deleted.
                onKindChanged={(next) => {
                  showKind(next)
                  void refresh()
                }}
                // Off this list and onto the other, so the card leaves and its editor closes.
                // Patched in place: the reading list keeps its read-date order and the archive
                // sorts by this stamp as it draws.
                onArchived={(archivedAt) => {
                  setEditing(null)
                  setArtists((rows) =>
                    remember(
                      rows.map((row) =>
                        row.id === artist.id ? { ...row, archived_at: archivedAt } : row
                      )
                    )
                  )
                }}
                onDeleted={() => {
                  setEditing(null)
                  setArtists((rows) => remember(rows.filter((row) => row.id !== artist.id)))
                }}
                onView={setViewing}
              />
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <ArtistImageViewer key={viewing.id} image={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
