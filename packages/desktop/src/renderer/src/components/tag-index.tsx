import { useState } from 'react'
import {
  categoryColor,
  categoryLabel,
  categoryOrder,
  type Tag,
  type TagCategory,
} from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON, buttonToggle } from './buttons'
import { FIELD } from './panel'
import { FormSectionsView } from './form-sections'
import { RuleDiagram } from './rule-diagram'
import { TagGrid } from './tag-grid'
import { CreateTag } from './tag-create'
import { EditTag } from './tag-edit'
import { useTagIndex } from './tag-index-store'
import { useFormSections } from '../form-sections'

/**
 * The board's tags: grouped by category in the `TAG_CATEGORIES` order, A–Z inside each
 * group. Read by `listTags` in `@common/data/shared`.
 *
 * Nothing carries a tag since the posts were shelved (0012). The vocabulary, its rules and
 * the form's rows are kept for a later use, and this is where they are kept — the question
 * it answers is "does this tag already exist, and under what spelling".
 *
 * Clicking a tag opens its editor: rename it, recategorize it, delete it, write its rules.
 * That is the only thing a click here means. Creating a name up front sits in the header
 * row, where it is not attached to whichever row happens to be under the pointer.
 */
export function TagIndex() {
  const [editing, setEditing] = useState<Tag | null>(null)
  const [creating, setCreating] = useState(false)
  const [diagram, setDiagram] = useState(false)
  // The form sections, which are a screen rather than a panel — like the rule map, and for
  // the same reason: laying out every row with its tags inside it wants the whole window.
  const [sectionsView, setSectionsView] = useState(false)
  // Narrows the grid, which is what makes a board of a few hundred tags browsable: the box
  // it replaced was an autocomplete, and browsing to a name is only better than typing one
  // while the name is on screen.
  const [filter, setFilter] = useState('')
  // Which categories are unfolded. Plain state, not the module-level cache the index is
  // held in: the screen unmounts whenever another view is in front, and coming back to it
  // folded is the right default — the fold is about what you are looking at now, where the
  // tag list is about what the board holds.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const formSections = useFormSections()
  const { tags, fetchedAt, loading, loadError, refresh } = useTagIndex()

  /** A re-read, and the one thing that has to happen with it: the open panel is about a row
   *  that may not survive the answer — a delete takes it away and a rename moves it. */
  const reload = () => {
    setEditing(null)
    void refresh()
  }

  // Matched against the stored spelling with spaces read as underscores, so the box takes
  // `blue archive` and `blue_archive` alike — the same courtesy the tag picker's does.
  const typed = filter.trim().toLowerCase().replace(/ /g, '_')
  const shown = typed ? (tags ?? []).filter((tag) => tag.name.includes(typed)) : (tags ?? [])

  /**
   * Whether a category's grids are drawn. Folded by default: a board of a few hundred tags
   * is a screen you scroll past rather than read, and the category you came for is the one
   * thing you already know.
   *
   * **Filtering forces every one open**, that being the moment the answer is a tag you
   * cannot see yet: a filter matching four tags in three folded categories would look like a
   * filter matching nothing. The fold is remembered underneath, so clearing the box puts
   * back what you had open.
   *
   * Nothing here is a request: the whole index is already in memory, and unfolding is
   * `display` and not a read.
   */
  const showAll = typed !== ''
  const isOpen = (category: TagCategory): boolean => showAll || expanded.has(category)

  const toggle = (category: TagCategory): void =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(category)) next.add(category)
      return next
    })

  const rows = categoryOrder(shown.map((tag) => tag.category))
    .map(
      (category) =>
        [
          category,
          shown
            .filter((tag) => tag.category === category)
            .sort((a, b) => tagLabel(a.name).localeCompare(tagLabel(b.name))),
        ] as [TagCategory, Tag[]]
    )
    .filter(([, group]) => group.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-4 pb-25">
      {/* One row for everything that is not a tag: what this screen is, how old its list
          is, the operation that is not about a row you are pointing at, and the two views
          of it. */}
      <div className="flex flex-wrap items-center gap-1">
        <h1 className="mr-1 text-lg font-bold tracking-tight">Tags</h1>
        {/* What a cache owes you: how old it is. Time only — a list from an hour ago and
            one from Tuesday both just say "not now", and the date is never the answer to
            "should I press refresh". */}
        {fetchedAt !== null && (
          <span className="text-xs text-muted">
            as of {new Date(fetchedAt).toLocaleTimeString([], { timeStyle: 'short' })}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCreating((was) => !was)}
          title="Name a new tag"
          className={`${buttonToggle(creating)} ml-auto`}
        >
          <span aria-hidden>➕</span>
          New tag
        </button>
        {/* Beside the rule map below it, being the other thing here that is a view rather
            than a panel: both are about all of the tags at once and none in particular. */}
        <button
          type="button"
          onClick={() => setSectionsView(true)}
          title="The rows of the tag form, their order, and what is on each"
          className={BUTTON}
        >
          <span aria-hidden>🧱</span>
          Sections
        </button>
        {/* The rules are written one tag at a time, on the panel a row opens — which is
            the right place to write one and the wrong place to see what they add up to,
            since an implication chains through tags that are rows of their own. This is
            the other view of the same file. Top right, away from the rows: it is about
            all of them and none in particular. */}
        <button
          type="button"
          onClick={() => setDiagram(true)}
          title="Every tag rule on this machine, drawn as the chains they make"
          className={BUTTON}
        >
          <span aria-hidden>🗺️</span>
          Rule map
        </button>
      </div>

      {diagram && <RuleDiagram onClose={() => setDiagram(false)} tags={tags} />}

      {/* Filing a tag onto a row moves nothing this screen draws except the row a tag names,
          so the re-read is asked for on the way out rather than after every drop. */}
      {sectionsView && (
        <FormSectionsView
          tags={tags}
          onClose={() => setSectionsView(false)}
          onChanged={reload}
        />
      )}

      {/* A browser's toolbar: reload at the head of the row, then the box, filling
          everything left. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          title="Read the tag index again"
          className={BUTTON}
        >
          {/* Faded, not spun. A spinner on a single glyph is a lot of motion in the corner
              of the eye for a read that is usually over before it is noticed, and an emoji
              rotating about its own box wobbles. Dimming says the same thing quietly. */}
          <span aria-hidden className={`transition-opacity ${loading ? 'opacity-30' : ''}`}>
            🔄
          </span>
          Refresh
        </button>
        {/* Narrows the grid below, and nothing else — no request, no submit. The list is
            already in memory, which is the only reason a box that filters on every
            keystroke is cheap. It keeps its border, being the one thing here you type into
            rather than press. */}
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="blue_hair"
          spellCheck={false}
          className={`${FIELD} flex-1 font-mono`}
        />
      </div>

      {creating && <CreateTag onDone={reload} />}

      {editing && (
        // Keyed by the tag, so selecting another row remounts the panel with that
        // tag's name and category rather than syncing props into state after the fact.
        <EditTag
          key={editing.id}
          tag={editing}
          sections={formSections}
          onClose={() => setEditing(null)}
          onDone={reload}
        />
      )}

      {loadError && (
        <p className="rounded-lg border border-[#ff5d5f]/40 bg-[#ff5d5f]/10 px-4 py-3 text-sm text-[#ff5d5f]">
          {loadError}
        </p>
      )}

      {tags === null ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loadError ? 'Nothing to show — 🔄 tries again.' : 'Loading…'}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {typed ? `No tag matches “${typed}”.` : 'No tags yet — ➕ New tag names one.'}
        </p>
      ) : (
        // One grid per category, and no division inside it. It was split by form section
        // for as long as a section was a division of a category and the two screens were
        // therefore the same shape. They are not: the form is rows holding tags of any
        // category, laid out on the 🧱 Sections screen with each row's tags inside it, and
        // repeating that division here drew the same list twice in two arrangements — while
        // making a category read as an outline of headings rather than as what it is, the
        // list of what the board calls this kind of thing. Which row a tag is on is the
        // other screen's question, and it is one drag from here.
        rows.map(([category, group]) => {
          const open = isOpen(category)

          return (
            <section key={category} className="flex flex-col gap-2">
              {/* The heading is the control. A chevron beside a label that was already the
                  obvious thing to press would be a second, smaller target for the same
                  gesture — the whole line is the row. The count is what makes a folded category worth
                  looking at rather than opening. */}
              <button
                type="button"
                onClick={() => toggle(category)}
                aria-expanded={open}
                className="flex min-h-8 items-center gap-1.5 rounded text-left text-xs font-semibold uppercase tracking-wide text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                <span aria-hidden className="w-3">
                  {open ? '▾' : '▸'}
                </span>
                <span className={categoryColor(category)}>{categoryLabel(category)}</span>
                <span className="tabular-nums">({group.length})</span>
              </button>
              {open && (
                <TagGrid
                  tags={group}
                  category={category}
                  editingId={editing?.id ?? null}
                  onSelect={setEditing}
                />
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
