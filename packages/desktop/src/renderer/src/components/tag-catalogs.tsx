import { useState } from 'react'
import { tagLabel } from '@common/search'
import { categoryColor, type Tag } from '@common/tags'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { TagMark } from './category-tag-field'
import { FIELD, Panel } from './panel'
import { TagImport } from './tag-import'
import { saveCatalogs, useCatalogs } from '../catalogs'
import { catalogName, renameCatalog, CATALOG_NAME_MAX } from '../../../shared/catalogs'

/**
 * The catalogs, built on the Tags screen — where every tag on the board is already on
 * screen, spelled the way the board spells it.
 *
 * A catalog is a set of tags with a name on it, applied when it is asked for by name. It is
 * for what the two rule sets cannot say: the tags that are true of *this set of images* —
 * the artist, the character, the copyright, the three meta tags — which belong to no
 * particular tag and so hang off no rule.
 *
 * **Nothing here is typed except the name.** The tags come from the grid below, exactly as
 * a rule's do: 👆 Choose turns it into the picker and a click ticks a tag in or out. So a
 * catalog can only ever name tags the board has — the rule everywhere else a post is
 * tagged — and coining the missing one is ➕ New tag, on this same screen.
 *
 * **Or from a post.** 📋 From a post is the import dialog the upload queue uses, pointed at
 * the open catalog instead of at a card: find the post you tagged an hour ago, take its
 * tags, and the set you were going to re-pick one by one is already built. That is the
 * shape most catalogs start as — page one of something you are still uploading.
 */
export function TagCatalogs({
  tags,
  picking,
  onPick,
  onClose,
}: {
  /**
   * The board's index, as the screen above already holds it. A catalog stores names and no
   * categories on purpose, so this is what draws its tags the way every other tag in the
   * window is drawn — the colour of the category it is actually filed under now, and the
   * mark on its row. Null while the index is still being read, which costs the colour and
   * nothing else.
   */
  tags: Tag[] | null
  /** The catalog the grid below is currently filling in, or null for its ordinary job. */
  picking: string | null
  onPick: (name: string | null) => void
  onClose: () => void
}) {
  const catalogs = useCatalogs()
  const names = Object.keys(catalogs)
  // Which catalog's contents are on screen. Held here rather than derived from `picking`,
  // because a catalog is open long before it is being picked into — and stays open after.
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  /** Opening another catalog ends any pick with it — the grid answers one at a time. */
  function show(name: string | null) {
    setOpen(name)
    setError('')
    onPick(null)
  }

  function create() {
    const name = catalogName(draft)
    if (!name) return
    if (names.includes(name)) {
      setError(`There is already a catalog called “${name}”.`)
      return
    }
    // Written empty, and stays empty until something is picked into it: `normalizeCatalogs`
    // keeps a catalog with no tags precisely so that naming one first works.
    void saveCatalogs({ ...catalogs, [name]: [] })
    setDraft('')
    setCreating(false)
    show(name)
  }

  return (
    <Panel
      title="Catalogs"
      // Only while the grid is answering it. At rest this is a panel above a list like the
      // other two; during a pick it is the record of what you are building, and a record
      // that scrolls off the top while you click is no record.
      pinned={picking !== null}
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              setCreating(!creating)
              setError('')
            }}
            title="Name a set of tags you apply together"
            className={`${BUTTON_ON_SURFACE} ${creating ? 'text-accent' : ''}`}
          >
            ➕ New
          </button>
          <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
            ❌ Close
          </button>
        </>
      }
    >
      {creating && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && create()}
            // An example, not a description: what a catalog is called is the whole of what
            // makes it findable a month later, and "the artist and the series" is the habit
            // worth showing.
            placeholder="Blue Archive · Hoshino"
            maxLength={CATALOG_NAME_MAX}
            spellCheck={false}
            className={`${FIELD} min-w-48 flex-1`}
          />
          <button
            type="button"
            onClick={create}
            disabled={!catalogName(draft)}
            className={BUTTON_SUBMIT_ON_SURFACE}
          >
            <span aria-hidden>➕</span> Create
          </button>
        </div>
      )}

      {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

      {names.length === 0 ? (
        <p className="text-xs text-muted">
          No catalogs yet. ➕ New names one; the tags go in from the list below, or from a
          post you have already tagged.
        </p>
      ) : (
        // Every catalog at once, as a row of names with their sizes. There are never many —
        // a catalog is per set or per character — so a list that shows all of them beats a
        // menu that shows one, and which one is open is then a colour rather than a memory.
        <div className="flex flex-wrap gap-1">
          {names.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => show(open === name ? null : name)}
              title={`${catalogs[name].length} tag${catalogs[name].length === 1 ? '' : 's'}`}
              className={`flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
                open === name
                  ? 'border-accent text-accent'
                  : 'border-border text-muted hover:border-accent hover:text-foreground'
              }`}
            >
              <span aria-hidden>📚</span>
              {name}
              <span className="tabular-nums opacity-70">{catalogs[name].length}</span>
            </button>
          ))}
        </div>
      )}

      {open !== null && catalogs[open] !== undefined && (
        // Keyed by the name, so opening another catalog remounts the form with that one's
        // name in its box rather than syncing a prop into state afterwards.
        <CatalogDetail
          key={open}
          name={open}
          tags={catalogs[open]}
          index={tags}
          picking={picking === open}
          onPick={(on) => onPick(on ? open : null)}
          onRenamed={(next) => show(next)}
          onDeleted={() => show(null)}
        />
      )}
    </Panel>
  )
}

/**
 * One catalog: what is in it, what it is called, and the two ways to put something in.
 *
 * Every control writes on use, like the post editor's — there is nothing here being
 * composed. The exception is the name, which is a box you type into and so has a button:
 * a rename that fired per keystroke would leave a catalog called `B` behind on the way to
 * `Blue Archive`.
 */
function CatalogDetail({
  name,
  tags,
  index,
  picking,
  onPick,
  onRenamed,
  onDeleted,
}: {
  name: string
  tags: string[]
  /** The board's tags, for the colour and the mark in front of each name. */
  index: Tag[] | null
  picking: boolean
  onPick: (on: boolean) => void
  onRenamed: (next: string) => void
  onDeleted: () => void
}) {
  const catalogs = useCatalogs()
  const [typed, setTyped] = useState(name)
  const [confirming, setConfirming] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const renamed = catalogName(typed)
  const changed = renamed !== '' && renamed !== name

  function rename() {
    if (!changed) return
    if (catalogs[renamed] !== undefined) {
      setError(`There is already a catalog called “${renamed}”.`)
      return
    }
    void saveCatalogs(renameCatalog(catalogs, name, renamed))
    onRenamed(renamed)
  }

  function remove() {
    const next = { ...catalogs }
    delete next[name]
    void saveCatalogs(next)
    onDeleted()
  }

  /** What a post's tags add — the ones this catalog does not already hold. */
  function absorb(incoming: string[]) {
    const next = [...tags]
    for (const tag of incoming) if (!next.includes(tag)) next.push(tag)
    void saveCatalogs({ ...catalogs, [name]: next })
    setImporting(false)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => event.key === 'Enter' && rename()}
          aria-label={`What ${name} is called`}
          maxLength={CATALOG_NAME_MAX}
          spellCheck={false}
          className={`${FIELD} min-w-48 flex-1`}
        />
        <button
          type="button"
          onClick={rename}
          disabled={!changed}
          className={BUTTON_SUBMIT_ON_SURFACE}
        >
          <span aria-hidden>💾</span> Rename
        </button>
        {/* The import dialog the queue's cards use, aimed at a catalog instead of a card.
            A catalog is most often the tags of a post you already made — page one of the
            set you are in the middle of — and finding that post is a search this window
            already knows how to run. */}
        <button
          type="button"
          onClick={() => setImporting(true)}
          title="Take the tags off a post already on the board"
          className={BUTTON_ON_SURFACE}
        >
          📋 From a post
        </button>
        <button
          type="button"
          onClick={() => setConfirming(!confirming)}
          className={`${BUTTON_ON_SURFACE} hover:text-[#ff5d5f]`}
        >
          🗑️ Delete
        </button>
      </div>

      {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

      {tags.length === 0 ? (
        <p className="text-xs text-muted">Nothing in it yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => {
            // A catalog holds a name; what that name *is* — its category and its mark —
            // belongs to the board, so it is read off the index rather than stored here.
            // A tag the index has not got is drawn plain: it is either still loading or no
            // longer on the board, and both are honest as the absence of a colour.
            const known = (index ?? []).find((row) => row.name === tag)
            return (
              <span
                key={tag}
                className={`flex items-center gap-1.5 rounded border border-border bg-background pl-2 font-mono text-xs ${categoryColor(
                  known?.category ?? ''
                )}`}
              >
                <TagMark mark={known?.mark ?? null} />
                {tagLabel(tag)}
                <button
                  type="button"
                  onClick={() =>
                    void saveCatalogs({ ...catalogs, [name]: tags.filter((t) => t !== tag) })
                  }
                  aria-label={`Take ${tagLabel(tag)} out of ${name}`}
                  className="flex min-h-7 items-center px-1.5 text-muted hover:text-[#ff5d5f]"
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* The same gesture the rules use, and the same words, because it is the same grid
          doing the same thing — a control that behaves identically in two panels should not
          have to be learned twice. */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onPick(!picking)}
          className={`${BUTTON_ON_SURFACE} self-start ${
            picking ? 'bg-accent/15 font-semibold text-accent' : 'text-accent'
          }`}
        >
          {picking ? (
            <>
              <span aria-hidden>✅</span> Done
            </>
          ) : (
            <>
              <span aria-hidden>👆</span> Choose from the list
            </>
          )}
        </button>
        {picking && (
          <p className="text-xs text-accent">
            Click tags below to add or remove what {name} holds. Escape stops.
          </p>
        )}
      </div>

      {/* A catalog is this machine's and holds nothing but names, so deleting one costs
          what it says and no more — the tags stay on every post carrying them. Said out
          loud all the same, because "delete" beside a list of tags reads worse than it is. */}
      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#ff5d5f] bg-[#ff5d5f]/5 p-2 text-xs">
          <span className="text-muted">
            Forget “{name}”? The tags in it stay on the board and on every post — only the
            set goes.
          </span>
          <button
            type="button"
            onClick={remove}
            className="ml-auto min-h-8 rounded-lg bg-[#ff5d5f] px-3 text-xs font-semibold text-[#0d0f14] transition-opacity hover:opacity-90"
          >
            Delete it
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-8 rounded-lg border border-border px-3 text-xs transition-colors hover:bg-background"
          >
            Keep it
          </button>
        </div>
      )}

      {importing && (
        <TagImport
          onImport={(imported) => absorb(imported.map((tag) => tag.name))}
          onClose={() => setImporting(false)}
          destination="catalog"
        />
      )}
    </div>
  )
}
