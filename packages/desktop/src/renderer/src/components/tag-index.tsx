import { useEffect, useReducer, useState } from 'react'
import { BOARDS, type Board } from '@common/board'
import {
  TAG_CATEGORIES,
  categoryColor,
  categoryLabel,
  categoryOrder,
  formSectionLabel,
  isSpacer,
  type Tag,
  type TagCategory,
} from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON, BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE, buttonToggle } from './buttons'
import { TagMark, invalidateTagNames } from './category-tag-field'
import { FIELD, Panel } from './panel'
import { FormSectionsView } from './form-sections'
import { RuleDiagram } from './rule-diagram'
import { TagCatalogs } from './tag-catalogs'
import { TagRuleEditor, toggleRuleName, type RuleKind } from './tag-rule-editor'
import { toggleCatalogTag } from '../../../shared/catalogs'
import { saveCatalogs, useCatalogs } from '../catalogs'
import { reloadFormSections, useFormSections } from '../form-sections'
import type { FormSection } from '@common/data/form-sections'
import { reloadImplications, saveImplication, useImplications } from '../implications'
import { reloadRecommendations, saveRecommendation, useRecommendations } from '../recommendations'

/**
 * What a click on the tag grid is currently answering, when it is not simply opening a tag.
 *
 * Two things fill themselves in from the grid — a tag's rules and a catalog — and they are
 * told apart by what the pick is *about*: a rule is about the tag whose panel is open, a
 * catalog is about a name that has nothing to do with any row. One at a time, because there
 * is one grid and a click has to mean one thing.
 *
 * A section's dependencies were a third. They are answered on the 🧱 Form sections screen
 * now, off the chips it already draws — which is the whole board's tags, laid out by row,
 * so the picker that gesture needed is there rather than here.
 */
type Picking = { into: RuleKind; tag: string } | { into: 'catalog'; name: string }

/**
 * The last index read, kept outside React on purpose. This screen is unmounted whenever
 * another view is in front of it (`App.tsx`), so component state meant a full re-read of
 * every tag on the board each time the header was clicked — a round trip to answer a
 * question whose answer had not changed. It only changes when something uploads, which
 * is rare enough that a list from a minute ago is the right default and a re-read is
 * worth asking for: hence 🔄 beside the title, and `invalidateTags()` below.
 *
 * Deliberately not persisted. It is a session's convenience, not state worth a file.
 *
 * **One per board**, because the number is per board. The names, categories, marks and
 * sections in it are one vocabulary either side — which is why this is one screen and not
 * two — but `post_count` is the column this grid sorts by and draws, and a count from the
 * other board would be the one wrong thing on a screen otherwise entirely about the
 * vocabulary.
 */
const cached: Partial<Record<Board, { tags: Tag[]; at: number } | null>> = {}

/**
 * Drops the cache without fetching, so the next visit reads the board again. Called when
 * an upload or an edit lands: that moves counts, which is exactly the moment a remembered
 * index becomes wrong.
 *
 * Both boards, because the callers that matter most — a rename, a delete — change the
 * vocabulary, which both copies hold. An upload only moves one board's counts and drops
 * the other's copy for nothing; a read it did not need is a cheaper mistake than a count
 * nobody notices is stale.
 */
export function invalidateTags(): void {
  for (const board of BOARDS) cached[board] = null
}

/**
 * The board's tags, as the website's /tags page draws them: grouped by category in
 * the `TAG_CATEGORIES` order, A–Z inside each group, with the
 * post count in a fixed slot on the right. Same read, same cap — `listTags` in
 * `@common/data/shared` backs both.
 *
 * It is here because the uploader's real question is "does this tag already exist, and
 * under what spelling" — the autocomplete answers that one tag at a time, and there was
 * nowhere to simply look. Sorted by label rather than by count for the same reason the
 * web page is: you arrive holding a name.
 *
 * Clicking a tag opens its editor: rename it, recategorize it, delete it, write its rules,
 * or open it on the board. That same click is also how a rule is *filled in*: with the
 * panel open and one of its two Choose buttons pressed, the grid stops being a list of
 * tags to manage and becomes the picker for the rule being written — see `pickTag` below.
 *
 * Managing a tag was the website's /tags/manage screen until the board lost its login —
 * the site holds an anon key and the schema has no write policy for it, so the vocabulary
 * is managed here or nowhere. The two operations that are not about one existing tag —
 * creating a name up front, and applying a tag to everything already carrying another —
 * sit in the header row, where they are not attached to whichever row happens to be under
 * the pointer.
 */
export function TagIndex({
  board,
  onBrowse,
}: {
  /** Which board's counts this grid shows, and which board Apply by tag applies on. */
  board: Board
  onBrowse: (query: string) => void
}) {
  const [editing, setEditing] = useState<Tag | null>(null)
  const [panel, setPanel] = useState<'none' | 'create' | 'apply' | 'catalogs'>('none')
  const [diagram, setDiagram] = useState(false)
  // The form sections, which are a screen rather than a panel — like the rule map, and for
  // the same reason: laying out every row with its tags inside it wants the whole window.
  const [sectionsView, setSectionsView] = useState(false)
  // What the grid is currently filling in, or null for its ordinary job. It lives here
  // rather than in the panel because the two halves of the gesture are in different
  // components — the button that starts it is in a panel, and the tags it is answered with
  // are the list below.
  const [picking, setPicking] = useState<Picking | null>(null)
  // Narrows the grid, which is what makes picking from it practical on a board with a few
  // hundred tags — the box it replaced was an autocomplete, and browsing to a name is only
  // better than typing one while the name is on screen. It earns its place outside picking
  // too: finding the tag to rename was the same scroll.
  const [filter, setFilter] = useState('')
  // Which categories are unfolded. Plain state, not the module-level cache below: the
  // screen unmounts whenever another view is in front, and coming back to it folded is the
  // right default — the fold is about what you are looking at now, where the tag list is
  // about what the board holds.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const implications = useImplications()
  const recommendations = useRecommendations()
  const formSections = useFormSections()
  const catalogs = useCatalogs()
  /**
   * **The list is read from the module cache as it is drawn, not copied into state.**
   *
   * It was a copy, and a copy is what made the mode switch wrong: the effect that filled
   * it returned early whenever the board it switched to was already cached, so the first
   * switch re-read the other board and switching back left the rows of one board showing
   * the counts of the other, for as long as the screen stayed open. Deriving it is not a
   * patch on that — it removes the thing that could disagree. `cached[board]` is the only
   * answer to "what does this board's index say", and there is now one of it.
   *
   * This screen is deliberately **not** remounted when the mode changes, unlike Browse
   * which is keyed on it: the filter you typed, the tag you have open and which categories
   * you unfolded are all worth keeping across a switch, since a switch is a question about
   * counts rather than about what you were doing.
   *
   * `bump` is what tells React the module-level object moved — a mutation outside React is
   * invisible to it. A reducer rather than a counter in `useState`, so there is no number
   * to name and nothing reading it.
   */
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const held = cached[board] ?? null
  const tags = held?.tags ?? null
  const fetchedAt = held?.at ?? null

  /**
   * Why the list could not be read, or ''. `listTags` throws now rather than answering with
   * an empty list — a refused query and a board with no tags are not the same thing — so
   * this screen has to have somewhere to put the difference. Without it a failed read left
   * `tags` null and "Loading…" on screen for good, with Refresh disabled by the same flag.
   *
   * It carries the board it happened on, so switching mode clears it without anything
   * having to remember to: a failure is about one board's read and says nothing about the
   * other's.
   */
  const [failure, setFailure] = useState<{ board: Board; message: string } | null>(null)
  const loadError = failure?.board === board ? failure.message : ''

  /** True while 🔄 is re-reading. The ordinary first read needs no flag: with nothing
   *  cached and no error, "loading" is what having no rows *means*. */
  const [refreshing, setRefreshing] = useState(false)
  const loading = refreshing || (tags === null && loadError === '')

  /**
   * Only when there is nothing to show — for this board. Coming back to this screen, or
   * switching back to a board read earlier, paints the list already held; the 🔄 beside the
   * title is how you ask for a new one.
   *
   * Nothing is set synchronously here. The rows and the "Loading…" under them both derive
   * from the cache, so a board with no copy yet already draws as loading on the render the
   * switch causes, one round trip before this effect could have said so.
   */
  useEffect(() => {
    if (cached[board]) return

    let alive = true
    void window.api
      .listTags(board)
      .then((next) => {
        cached[board] = { tags: next, at: Date.now() }
        if (alive) bump()
      })
      .catch((error: unknown) => {
        if (!alive) return
        setFailure({
          board,
          message: error instanceof Error ? error.message : 'Could not read the tags.',
        })
      })
    return () => {
      alive = false
    }
  }, [board])

  async function refresh() {
    openTag(null)
    setRefreshing(true)
    // Both copies, or the button lies: main keeps the index for a day (`main/tag-cache.ts`)
    // and would hand back the same list this screen is already showing. 🔄 means "read the
    // board", which is a thing only main can do.
    await window.api.clearTagCache()
    // Creating, renaming and deleting all land here, and they are the only things that can
    // change the names the tag pickers offer — this is where that copy is dropped too.
    invalidateTagNames()
    // And the rules, which are rows keyed by tag id: a rename carries every rule naming
    // that tag and a delete takes them with it, both on the board and both invisible to a
    // window still holding the names from before.
    await Promise.all([
      reloadImplications(),
      reloadRecommendations(),
      reloadFormSections(),
    ])
    try {
      const next = await window.api.listTags(board)
      cached[board] = { tags: next, at: Date.now() }
      setFailure(null)
      bump()
    } catch (error) {
      // The list already on screen stands: a failed re-read is a reason to say so, not a
      // reason to throw away the copy that is still the best answer anyone has.
      setFailure({
        board,
        message: error instanceof Error ? error.message : 'Could not read the tags.',
      })
    } finally {
      setRefreshing(false)
    }
  }

  /**
   * What a click on a tag in the grid means, which depends on what a panel is asking.
   *
   * Ordinarily it opens that tag. While a rule or a catalog is being filled in it toggles
   * that tag in *that* instead — and it toggles, so the same row that added it takes it off
   * again and the grid can be read as the answer rather than as a list of things already
   * done. The tag a rule is about is inert: a tag implying itself is the one rule that can
   * never fire. A catalog has no such tag, since it is about no tag at all.
   */
  function pickTag(tag: Tag) {
    if (!picking) {
      setEditing(tag)
      // A tag's panel and the catalogs panel are both pinned to the top of the scroller,
      // so only one of them may be open — and clicking a row is a request for that row's.
      if (panel === 'catalogs') setPanel('none')
      return
    }
    if (picking.into === 'catalog') {
      void saveCatalogs(toggleCatalogTag(catalogs, picking.name, tag.name))
      return
    }
    if (tag.name === picking.tag) return
    if (picking.into === 'implies') {
      void saveImplication(picking.tag, toggleRuleName(implications[picking.tag] ?? [], tag.name))
    } else {
      void saveRecommendation(
        picking.tag,
        toggleRuleName(recommendations[picking.tag] ?? [], tag.name)
      )
    }
  }

  /** Closing the panel, or opening another tag's, ends any pick with it. */
  function openTag(tag: Tag | null) {
    setEditing(tag)
    setPicking(null)
  }

  /**
   * Which panel sits above the list. Pressing the one already open closes it.
   *
   * Any change ends a pick, because the panel being filled in may be the one leaving — a
   * grid still answering a catalog that is no longer on screen is a list whose clicks go
   * somewhere you cannot see. Opening the catalogs also closes a tag: both of those panels
   * pin to the top of the scroller, so they take turns.
   */
  function showPanel(next: typeof panel) {
    setPanel((current) => (current === next ? 'none' : next))
    setPicking(null)
    if (next === 'catalogs') setEditing(null)
  }

  // Escape leaves the pick without leaving the panel — the hand is on the list, not on
  // the Done button, which is the whole point of the gesture.
  useEffect(() => {
    if (!picking) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])

  // The names already in whatever is being filled in, so the grid can mark them
  const ruleSet = { implies: implications, recommends: recommendations }
  const picked = new Set(
    picking === null
      ? []
      : picking.into === 'catalog'
        ? catalogs[picking.name] ?? []
        : ruleSet[picking.into][picking.tag] ?? []
  )

  /**
   * Why a tag cannot go into whatever is being filled in, or null if it can.
   *
   * One case: a **rule** cannot name the tag it is about, a tag implying itself being the
   * one rule that can never fire. A catalog refuses nothing — it is about a set of images,
   * not about a tag.
   *
   * Answered as the sentence the grid shows, so the reason is written once and lands in the
   * title of the cell it is about.
   */
  const inertReason = (tag: Tag): string | null => {
    if (!picking || picking.into === 'catalog') return null
    return tag.name === picking.tag ? `${tagLabel(tag.name)} is the tag this rule is about` : null
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
   * **Filtering and picking force every one open.** Both are moments when the answer is a
   * tag you cannot see yet — a filter that matched four tags in three folded categories
   * would look like a filter that matched nothing, and a rule being filled in from a folded
   * grid is a screen with nothing to click. The fold is remembered underneath, so clearing
   * the box puts back what you had open.
   *
   * Nothing here is a request: the whole index is already in memory, and unfolding is
   * `display` and not a read. What made the board expensive was re-reading that index after
   * every upload, which is `bumpTagCounts` in main and not this.
   */
  const showAll = typed !== '' || picking !== null
  const isOpen = (category: TagCategory): boolean => showAll || expanded.has(category)

  const toggle = (category: TagCategory): void =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(category)) next.add(category)
      return next
    })

  // `rows`, not `groups`: a group on this screen is a form group now, and the two would be
  // one word for a category of tags and for one tag's rule about the form.
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
          is, the box that narrows it, the two operations that are not about a row you are
          pointing at, and the two views of it. They were on two rows, one of bare links
          and one of outlined buttons, which drew a line between things that are all just
          "the controls" — and put the filter box a row away from the list it filters. */}
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
          onClick={() => showPanel('create')}
          title="Name a tag before anything carries it"
          className={`${buttonToggle(panel === 'create')} ml-auto`}
        >
          <span aria-hidden>➕</span>
          New tag
        </button>
        <button
          type="button"
          onClick={() => showPanel('apply')}
          title="Add one tag to every post that already has another"
          className={buttonToggle(panel === 'apply')}
        >
          <span aria-hidden>🧩</span>
          Apply by tag
        </button>
        {/* A catalog is named here for the same reason a rule is written here: everything
            that goes in one is a row on the list below, spelled the way the board spells
            it. Beside Apply by tag, which is the other control that acts on a set of posts
            rather than on the row under the pointer. */}
        <button
          type="button"
          onClick={() => showPanel('catalogs')}
          title="Sets of tags you apply together, by name"
          className={buttonToggle(panel === 'catalogs')}
        >
          <span aria-hidden>📚</span>
          Catalogs
        </button>
        {/* Beside the rule map below it, being the other thing here that is a view rather
            than a panel: both are about all of the tags at once and none in particular. */}
        <button
          type="button"
          onClick={() => setSectionsView(true)}
          title="The rows the upload form draws, their order, and what is on each"
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
          onChanged={() => void refresh()}
        />
      )}

      {/* A browser's toolbar, and Browse has the same one: reload at the head of the row,
          then the box, filling everything left. Refresh sat in the far corner of the title
          row, a screen's width from the timestamp it answers, with the filter box on a row
          of its own stopping short of the edge for no reason. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
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
            keystroke is cheaper than the autocomplete it replaces. It keeps its border,
            being the one thing here you type into rather than press. */}
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="blue_hair"
          spellCheck={false}
          className={`${FIELD} flex-1 font-mono`}
        />
      </div>


      {panel === 'create' && <CreateTag onDone={() => void refresh()} />}
      {panel === 'apply' && <ApplyTag board={board} onDone={() => void refresh()} />}
      {panel === 'catalogs' && (
        <TagCatalogs
          tags={tags}
          picking={picking?.into === 'catalog' ? picking.name : null}
          onPick={(name) => setPicking(name ? { into: 'catalog', name } : null)}
          onClose={() => showPanel('none')}
        />
      )}

      {editing && (
        // Keyed by the tag, so selecting another row remounts the panel with that
        // tag's name and category rather than syncing props into state after the fact.
        <EditTag
          key={editing.id}
          tag={editing}
          onBrowse={onBrowse}
          sections={formSections}
          // The rule editor knows about its own two kinds and nothing else; a catalog
          // pick is somebody else's business and reads to it as no pick at all.
          picking={picking && picking.into !== 'catalog' ? picking.into : null}
          onPick={(kind) => setPicking(kind ? { into: kind, tag: editing.name } : null)}
          onClose={() => openTag(null)}
          onDone={() => void refresh()}
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
          {typed ? `No tag matches “${typed}”.` : 'No tags yet — they are created by uploads.'}
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
                  gesture — the whole line is the row, the way the drop zone on the upload
                  form is the whole button. The count is what makes a folded category worth
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
                  onSelect={pickTag}
                  picking={picking !== null}
                  picked={picked}
                  inert={inertReason}
                />
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

/**
 * One block of tags: the whole of one category.
 *
 * Ruled like a table, the same way the web page is: a count sitting in open space reads as
 * close to the next column's name as to its own. Each cell carries its own right/bottom
 * rule and is pulled a pixel over its neighbour so shared edges stay hairlines.
 */
function TagGrid({
  tags,
  category,
  editingId,
  onSelect,
  picking = false,
  picked,
  inert,
}: {
  tags: Tag[]
  category: TagCategory
  editingId: number | null
  onSelect: (tag: Tag) => void
  /** The grid is answering a pick rather than opening a tag — see `pickTag`. */
  picking?: boolean
  /** Names already in whatever is being filled in. */
  picked?: Set<string>
  /**
   * Why this tag cannot be picked into what is open, or null if it can. A predicate rather
   * than a name, because the answer differs by what is being filled in — a rule cannot name
   * the tag it is about, a section cannot wait for a tag it holds — and both are the same
   * shape on screen: greyed, unclickable, and saying why.
   */
  inert?: (tag: Tag) => string | null
}) {
  return (
    <ul className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-4">
      {tags.map((tag) => {
        const chosen = picked?.has(tag.name) ?? false
        const refused = picking ? (inert?.(tag) ?? null) : null

        return (
          <li key={tag.id} className="-mb-px -mr-px border-b border-r border-border">
            <button
              type="button"
              onClick={() => onSelect(tag)}
              disabled={refused !== null}
              title={
                refused !== null
                  ? refused
                  : picking
                    ? chosen
                      ? `Take ${tagLabel(tag.name)} back off the rule`
                      : `Add ${tagLabel(tag.name)} to the rule`
                    : `Manage ${tagLabel(tag.name)}`
              }
              className={`flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent ${
                chosen ? 'bg-accent/10' : editingId === tag.id && !picking ? 'bg-surface' : ''
              } ${categoryColor(category)}`}
            >
              {/* Ahead of the name and outside the truncation, so a long tag loses its own
                  tail rather than the mark that identifies it fastest. */}
              <TagMark mark={tag.mark} />
              <span className="min-w-0 flex-1 truncate">{tagLabel(tag.name)}</span>
              {/* While picking, the fixed right-hand slot says whether this tag is in the
                  rule instead of how many posts carry it. Membership is the only thing
                  being decided, and it is what the count's column is worth during it — a
                  ✓ in a place the eye already scans beats a tick tucked beside the name. */}
              <span
                className={`w-8 shrink-0 text-right text-xs tabular-nums ${
                  picking && chosen ? 'text-accent' : 'text-muted'
                }`}
              >
                {picking ? (chosen ? '✓' : refused !== null ? '' : '＋') : tag.post_count}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The button that finishes a form — Create, Apply, Save.
 *
 * Unbordered on purpose. Each of these sits at the end of a row of bordered fields, and an
 * outlined button in that row read as a fourth box rather than as the control: the shapes
 * were the same and only the colour differed. What it is drawn as instead is its glyph and
 * its accent text, which is also how the header items above the list are drawn — the same
 * hover ground under both.
 */
const SUBMIT = BUTTON_SUBMIT_ON_SURFACE

/**
 * The category, as the menu both forms use.
 *
 * A menu rather than free text: `tags.category` is free-form in the database, but the
 * list it is drawn from is what gives a category its colour and its place in the order,
 * and a category with neither is a row nobody can find. Adding one is a line in
 * `TAG_CATEGORIES` and a colour beside it, which is the change that makes it real
 * everywhere — the website's /tags included — rather than only in this window.
 */
function CategoryField({
  value,
  onChange,
  disabled = false,
}: {
  value: TagCategory
  onChange: (next: TagCategory) => void
  disabled?: boolean
}) {
  return (
    // Coloured closed and open, the way the rating select is: the colour is how a category
    // is recognised everywhere else on this screen — the tag rows, the section headings,
    // the chips on a post — so the one place you *choose* one was the only place it was
    // just a word.
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={`${FIELD} ${categoryColor(value)}`}
    >
      {TAG_CATEGORIES.map((option) => (
        <option key={option} value={option} className={`bg-background ${categoryColor(option)}`}>
          {categoryLabel(option)}
        </option>
      ))}
    </select>
  )
}

/**
 * Which row of the desktop tag form a tag is offered on — `tags.form_section_id`, whose
 * migration has why it is an id.
 *
 * A menu, and it has been three things now. A fixed list in code was wrong because how a
 * form wants dividing is a judgement about one board's own vocabulary. Free text with a
 * datalist was right about that and wrong about everything else: no order, no row until a
 * tag was already on it, and a near-duplicate the first time somebody typed `hair colour`.
 * The sections are rows on the board now, made and ordered on the 🧱 Sections panel, so this
 * is a menu again — and this time the list it offers is one you wrote.
 *
 * **Every row, whatever the tag's category is.** They were the rows of that category alone
 * while a section belonged to one, which is exactly the constraint that went: `bikini` is
 * General and belongs on the swimsuit row beside Appearance tags.
 *
 * Empty means no row at all, which is not the same as harmless: a tag on no section is not
 * offered anywhere in the form. That is the point of it — an unfiled tag is one the
 * vocabulary has not decided about — and it is why this menu says so rather than saying
 * "none".
 *
 * Absent entirely on a board with no sections, rather than drawn empty: a menu whose only
 * option is "nowhere" is a control that cannot do anything, and its absence says the same
 * more quietly.
 */
function SectionField({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: number | null
  onChange: (next: number | null) => void
  options: FormSection[]
  disabled?: boolean
}) {
  if (options.length === 0) return null

  return (
    <select
      value={options.some((section) => section.id === value) ? String(value) : ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      disabled={disabled}
      className={`${FIELD} min-w-32 flex-1`}
    >
      <option value="">On no row — not offered</option>
      {options.map((section) => (
        <option key={section.id} value={section.id}>
          {formSectionLabel(section.name)}
        </option>
      ))}
    </select>
  )
}

/**
 * Name a tag before anything carries it — an artist or a series, with the category
 * already right. This is now the only way a tag comes into being: a post write resolves
 * the names it was given and fails on one the board doesn't have, rather than coining it
 * on the way past. So the order is always this one, and the tag starts on no posts.
 *
 * **It does not ask which row of the form the tag goes on**, and a new tag is therefore on
 * none — not offered anywhere until it is filed. That is two decisions and they are made at
 * different moments: naming one is about the vocabulary, filing it is about the shape of the
 * form, and the second is a question you answer for a set of tags at once on the 🧱 Form
 * sections screen, looking at what each row already holds. Asking here got a menu answered
 * on the way past, which is how a tag ends up on the row that happened to be first.
 */
function CreateTag({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TagCategory>('general')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const result = await window.api.createTag(name, category, null)
    setBusy(false)
    if (result.ok) {
      setMessage({ ok: true, text: `Created ${tagLabel(result.name)}.` })
      setName('')
      onDone()
    } else {
      setMessage({ ok: false, text: result.error })
    }
  }

  return (
    <Panel title="New tag">
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="blue_archive"
          spellCheck={false}
          className={`${FIELD} min-w-40 flex-1 font-mono`}
        />
        {/* Kept when the name is cleared below: naming five underwear tags in a row is what
            this form is for, and re-picking the category each time is what it saves. */}
        <CategoryField value={category} onChange={setCategory} />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
          className={SUBMIT}
        >
          {/* The glyph the header item that opened this panel is drawn with, so the thing
              pressed to start and the thing pressed to finish are visibly one operation. */}
          <span aria-hidden>➕</span> Create
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-muted' : 'text-[#ff5d5f]'}`}>{message.text}</p>
      )}
    </Panel>
  )
}

/**
 * Add one tag to every post already carrying another — `swimsuit` for everything tagged
 * `bikini`. The slowest thing this window does, and the only one that reports counts:
 * "added to 3, 41 already had it" is the difference between a rule that did something
 * and one that was already satisfied.
 */
function ApplyTag({ board, onDone }: { board: Board; onDone: () => void }) {
  const [target, setTarget] = useState('')
  const [condition, setCondition] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setMessage(null)
    const result = await window.api.applyTagToTagged(target, condition, board)
    setBusy(false)
    if (result.ok) {
      setMessage({
        ok: true,
        text: `Added ${tagLabel(result.target)} to ${result.added} post${
          result.added === 1 ? '' : 's'
        } — ${result.already} already had it.`,
      })
      onDone()
    } else {
      setMessage({ ok: false, text: result.error })
    }
  }

  return (
    <Panel title="Apply by tag">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="swimsuit"
          spellCheck={false}
          className={`${FIELD} min-w-32 flex-1 font-mono`}
        />
        <span className="text-xs text-muted">to every post tagged</span>
        <input
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          placeholder="bikini"
          spellCheck={false}
          className={`${FIELD} min-w-32 flex-1 font-mono`}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !target.trim() || !condition.trim()}
          className={SUBMIT}
        >
          <span aria-hidden>🧩</span> {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-muted' : 'text-[#ff5d5f]'}`}>{message.text}</p>
      )}
    </Panel>
  )
}

/**
 * One tag: rename it, recategorize it, delete it, or go and look at it on the board.
 *
 * Rename keeps the row's id, so every link and every post keeps the tag — only the text
 * moves. Delete does not: it takes the tag off every post carrying it, which is why it
 * takes a second press that says so.
 */
function EditTag({
  tag,
  onBrowse,
  sections,
  picking,
  onPick,
  onClose,
  onDone,
}: {
  tag: Tag
  onBrowse: (query: string) => void
  sections: FormSection[]
  picking: RuleKind | null
  onPick: (kind: RuleKind | null) => void
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(tag.name)
  const [category, setCategory] = useState<TagCategory>(tag.category)
  const [section, setSection] = useState<number | null>(tag.form_section_id ?? null)
  const [mark, setMark] = useState(tag.mark ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Opens by itself for a tag that already has rules — the panel then shows what this
  // machine does with the tag as well as what the board knows about it, which is the
  // whole reason the rules moved here. A tag with none stays a four-field row.
  //
  // null is "nobody has said", not "closed", so the default can follow the rules rather
  // than the moment: they are read from disk once per window, and seeding `useState` from
  // a count that has not landed yet would leave the very first tag opened in a session
  // folded shut with rules in it. Once toggled, the toggle wins.
  const implications = useImplications()
  const recommendations = useRecommendations()
  const ruleCount = (implications[tag.name]?.length ?? 0) + (recommendations[tag.name]?.length ?? 0)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const showRules = toggled ?? ruleCount > 0

  async function save() {
    setBusy(true)
    setError('')
    if (name !== tag.name) {
      const renamed = await window.api.renameTag(tag.id, name)
      if (!renamed.ok) {
        setBusy(false)
        setError(renamed.error)
        return
      }
    }
    if (category !== tag.category) {
      const recategorized = await window.api.setTagCategory(tag.id, category)
      if (!recategorized.ok) {
        setBusy(false)
        setError(recategorized.error)
        return
      }
    }
    // Independent of the category, and in either order: recategorizing leaves the column
    // alone now that a section is a row of the form rather than a division of a category.
    if (section !== (tag.form_section_id ?? null)) {
      const moved = await window.api.setTagFormSection(tag.id, section)
      if (!moved.ok) {
        setBusy(false)
        setError(moved.error)
        return
      }
    }
    if (mark !== (tag.mark ?? '')) {
      const marked = await window.api.setTagMark(tag.id, mark)
      if (!marked.ok) {
        setBusy(false)
        setError(marked.error)
        return
      }
    }
    setBusy(false)
    onDone()
  }

  async function remove() {
    setBusy(true)
    setError('')
    const result = await window.api.deleteTag(tag.id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onDone()
  }

  const changed =
    name !== tag.name ||
    category !== tag.category ||
    section !== (tag.form_section_id ?? null) ||
    mark !== (tag.mark ?? '')

  return (
    <Panel
      pinned
      title={`${tagLabel(tag.name)} · ${tag.post_count} post${tag.post_count === 1 ? '' : 's'}`}
      actions={
        <>
          {/* Leads the row because it is the one action here that is about this machine
              rather than about the board, and because the count answers the question
              before the panel is opened: a tag with no rules is most tags. */}
          <button
            type="button"
            onClick={() => {
              if (showRules) onPick(null)
              setToggled(!showRules)
            }}
            className={`${BUTTON_ON_SURFACE} ${showRules ? 'text-accent' : ''}`}
          >
            🔗 Rules{ruleCount > 0 ? ` (${ruleCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy || confirming}
            className={`${BUTTON_ON_SURFACE} hover:text-[#ff5d5f]`}
          >
            🗑️ Delete
          </button>
          {/* Its posts, in this window rather than in the browser. It used to open
              /tags/<id> on the site, which answered the question in a place that can only
              read: the reason you look at what a tag is on is usually to fix one of them,
              and every control for that is in Browse. Same question, and now the answer
              is somewhere you can act on it. */}
          <button
            type="button"
            onClick={() => onBrowse(tag.name)}
            title={`Browse the posts tagged ${tagLabel(tag.name)}`}
            className={BUTTON_ON_SURFACE}
          >
            🔍 Browse
          </button>
          <button
            type="button"
            onClick={onClose}
            className={BUTTON_ON_SURFACE}
          >
            ❌ Close
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* In front of the name, where what it holds is drawn — and drawn *as* it will be
            drawn, so a hex is a dot here before it is a dot on the board. Wide enough for
            `#7fc8ff` now that a colour goes in the same box as an emoji; an empty box
            clears the column. */}
        <span className="flex shrink-0 items-center gap-1.5">
          <input
            value={mark}
            onChange={(event) => setMark(event.target.value)}
            disabled={busy}
            aria-label={`Mark in front of ${tagLabel(tag.name)}`}
            title="An emoji, a #hex colour, or a CSS colour name. Empty for none."
            placeholder="🎀"
            spellCheck={false}
            className={`${FIELD} w-28 px-2 text-center font-mono`}
          />
          <TagMark mark={mark} />
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
          className={`${FIELD} min-w-40 flex-1 font-mono`}
        />
        {/* Two independent answers about one tag: what it is, and where it is offered.
            Changing the category used to clear the row, because the row belonged to the
            category it was under — it does not any more. */}
        <CategoryField value={category} onChange={setCategory} disabled={busy} />
        <SectionField
          value={section}
          onChange={setSection}
          options={sections.filter((row) => !isSpacer(row.name))}
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed}
          className={SUBMIT}
        >
          <span aria-hidden>💾</span> {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

      {/* This machine's rules about this tag, under the board's own facts about it, and
          folded away until asked for. The panel is pinned to the top of a scroller so the
          row you clicked stays in view; two tag boxes and a menu always open would make
          it tall enough to be the view rather than a strip over it. The count on the
          toggle is what makes it worth opening — or worth leaving shut.

          Against `tag.name`, not the name being typed above: a rule is written against a
          spelling that exists, and re-keying this on every keystroke in the name field
          would throw away a half-typed rule per character. */}
      {showRules && <TagRuleEditor tag={tag.name} picking={picking} onPick={onPick} />}

      {/* Drawn as what it is, like the post editor's. A tag is not only a row: deleting it
          takes it off every post carrying it, and that is the number worth reading before
          the button rather than after. Filled rather than outlined, and the way out sits
          where the hand was already going. */}
      {confirming && (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-[#ff5d5f] bg-[#ff5d5f]/5 p-3">
          <div>
            <h3 className="text-sm font-bold text-[#ff5d5f]">
              ⚠ Delete {tagLabel(tag.name)} for good
            </h3>
            <p className="mt-1 text-sm text-muted">
              It comes off{' '}
              <strong className="text-foreground">
                {tag.post_count} post{tag.post_count === 1 ? '' : 's'}
              </strong>{' '}
              and the tag itself is removed from the board. Any search or saved query
              naming it stops matching.{' '}
              <strong className="text-foreground">There is no undo.</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="min-h-9 rounded-lg bg-[#ff5d5f] px-4 text-sm font-semibold text-[#0d0f14] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-background"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}
