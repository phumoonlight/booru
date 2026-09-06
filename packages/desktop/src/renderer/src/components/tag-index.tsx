import { useEffect, useId, useState } from 'react'
import {
  TAG_CATEGORIES,
  categoryColor,
  categoryLabel,
  categoryOrder,
  subcategoryLabel,
  subcategoryOrder,
  type Tag,
  type TagCategory,
} from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON, BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE, buttonToggle } from './buttons'
import { TagMark, invalidateTagNames } from './category-tag-field'
import { FIELD, Panel } from './panel'
import { RuleDiagram } from './rule-diagram'
import { TagCatalogs } from './tag-catalogs'
import { TagRuleEditor, toggleRuleTag, type RuleKind } from './tag-rule-editor'
import { toggleCatalogTag } from '../../../shared/catalogs'
import { saveCatalogs, useCatalogs } from '../catalogs'
import { saveImplications, useImplications } from '../implications'
import { saveRecommendations, useRecommendations } from '../recommendations'

/**
 * What a click on the tag grid is currently answering, when it is not simply opening a tag.
 *
 * Two things fill themselves in from the grid now — a tag's rules and a catalog — and they
 * are told apart by what the pick is *about*: a rule is about the tag whose panel is open,
 * a catalog is about a name that has nothing to do with any row. One at a time, because
 * there is one grid and a click has to mean one thing.
 */
type Picking =
  | { into: RuleKind; tag: string }
  | { into: 'catalog'; name: string }

/**
 * The last index read, kept outside React on purpose. This screen is unmounted whenever
 * another view is in front of it (`App.tsx`), so component state meant a full re-read of
 * every tag on the board each time the header was clicked — a round trip to answer a
 * question whose answer had not changed. It only changes when something uploads, which
 * is rare enough that a list from a minute ago is the right default and a re-read is
 * worth asking for: hence 🔄 beside the title, and `invalidateTags()` below.
 *
 * Deliberately not persisted. It is a session's convenience, not state worth a file.
 */
let cached: { tags: Tag[]; at: number } | null = null

/**
 * Drops the cache without fetching, so the next visit reads the board again. Called when
 * an upload lands: a post creates tags and moves counts, which is exactly the moment a
 * remembered index becomes wrong.
 */
export function invalidateTags(): void {
  cached = null
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
export function TagIndex({ onBrowse }: { onBrowse: (query: string) => void }) {
  const [editing, setEditing] = useState<Tag | null>(null)
  const [panel, setPanel] = useState<'none' | 'create' | 'apply' | 'catalogs'>('none')
  const [diagram, setDiagram] = useState(false)
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
  const implications = useImplications()
  const recommendations = useRecommendations()
  const catalogs = useCatalogs()
  const [tags, setTags] = useState<Tag[] | null>(cached?.tags ?? null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(cached?.at ?? null)
  // Starts true when there is nothing cached, because the effect below is about to read
  // and this render is already the loading one. Setting it from inside the effect said
  // the same thing one render later, which is a cascading render React now lints for.
  const [loading, setLoading] = useState(cached === null)

  // Only when there is nothing to show. Coming back to this screen paints the list it
  // painted last time, and the 🔄 beside the title is how you ask for a new one.
  useEffect(() => {
    if (cached) return
    let alive = true
    void window.api.listTags().then((next) => {
      cached = { tags: next, at: Date.now() }
      if (!alive) return
      setTags(next)
      setFetchedAt(cached.at)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  async function refresh() {
    openTag(null)
    setLoading(true)
    // Both copies, or the button lies: main keeps the index for a day (`main/tag-cache.ts`)
    // and would hand back the same list this screen is already showing. 🔄 means "read the
    // board", which is a thing only main can do.
    await window.api.clearTagCache()
    // Creating, renaming and deleting all land here, and they are the only things that can
    // change the names the tag pickers offer — this is where that copy is dropped too.
    invalidateTagNames()
    const next = await window.api.listTags()
    cached = { tags: next, at: Date.now() }
    setTags(next)
    setFetchedAt(cached.at)
    setLoading(false)
  }

  /**
   * The subgroups already in use in a category — what the two forms offer while you type
   * one. A subgroup only does its job when every tag in it spells it the same way, and the
   * list of them exists nowhere but in the tags themselves, so the field that sets one has
   * to show what is already there or it is a free-text box inviting a near-duplicate.
   */
  const subcategoriesIn = (category: TagCategory): string[] =>
    subcategoryOrder((tags ?? []).filter((tag) => tag.category === category).map((t) => t.category2))

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
      void saveImplications(toggleRuleTag(implications, picking.tag, tag.name))
    } else {
      void saveRecommendations(toggleRuleTag(recommendations, picking.tag, tag.name))
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
  const picked = new Set(
    picking === null
      ? []
      : picking.into === 'catalog'
        ? catalogs[picking.name] ?? []
        : (picking.into === 'implies' ? implications : recommendations)[picking.tag] ?? []
  )

  // The tag a rule is being written about, which cannot be one of its own answers. A
  // catalog has none — it is about a set of images, not about a tag.
  const triggerName = picking && picking.into !== 'catalog' ? picking.tag : null

  // Matched against the stored spelling with spaces read as underscores, so the box takes
  // `blue archive` and `blue_archive` alike — the same courtesy the tag picker's does.
  const typed = filter.trim().toLowerCase().replace(/ /g, '_')
  const shown = typed ? (tags ?? []).filter((tag) => tag.name.includes(typed)) : (tags ?? [])

  const groups = categoryOrder(shown.map((tag) => tag.category))
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


      {panel === 'create' && (
        <CreateTag subcategoriesIn={subcategoriesIn} onDone={() => void refresh()} />
      )}
      {panel === 'apply' && <ApplyTag onDone={() => void refresh()} />}
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
          subcategoriesIn={subcategoriesIn}
          // The rule editor knows about its own two kinds and nothing else; a catalog
          // pick is somebody else's business and reads to it as no pick at all.
          picking={picking && picking.into !== 'catalog' ? picking.into : null}
          onPick={(kind) => setPicking(kind ? { into: kind, tag: editing.name } : null)}
          onClose={() => openTag(null)}
          onDone={() => void refresh()}
        />
      )}

      {tags === null ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Loading…
        </p>
      ) : groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {typed ? `No tag matches “${typed}”.` : 'No tags yet — they are created by uploads.'}
        </p>
      ) : (
        groups.map(([category, group]) => {
          // Split the same way the tag picker splits it, because this is where the split is
          // decided: a subgroup that is a near-duplicate of another, or a tag left out of
          // the one it belongs to, is only visible with the whole category laid out. A
          // category with no subgroups renders exactly the one grid it always did.
          const loose = group.filter((tag) => !tag.category2)
          const subgroups = subcategoryOrder(group.map((tag) => tag.category2)).map(
            (name) =>
              [name, group.filter((tag) => tag.category2 === name)] as [string, Tag[]]
          )

          return (
            <section key={category} className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {categoryLabel(category)} ({group.length})
              </h2>
              {loose.length > 0 && (
                <TagGrid
                  tags={loose}
                  category={category}
                  editingId={editing?.id ?? null}
                  onSelect={pickTag}
                  picking={picking !== null}
                  picked={picked}
                  triggerName={triggerName}
                />
              )}
              {subgroups.map(([name, list]) => (
                <div
                  key={name}
                  // Inset on the left, and quieter than the category above it — a subgroup
                  // is a division inside that heading, not a sibling of it, and the grid
                  // stepping in is what says so at a glance. Only the left: the right edge
                  // lines up with every other grid on the screen, so the step reads as an
                  // indent rather than as a narrower table.
                  className="flex flex-col gap-1 pl-3"
                >
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {subcategoryLabel(name)} ({list.length})
                  </h3>
                  <TagGrid
                    tags={list}
                    category={category}
                    editingId={editing?.id ?? null}
                    onSelect={pickTag}
                    picking={picking !== null}
                    picked={picked}
                    triggerName={triggerName}
                  />
                </div>
              ))}
            </section>
          )
        })
      )}
    </div>
  )
}

/**
 * One block of tags: the whole of a category, or one subgroup of it.
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
  triggerName = null,
}: {
  tags: Tag[]
  category: TagCategory
  editingId: number | null
  onSelect: (tag: Tag) => void
  /** The grid is answering a rule rather than opening a tag — see `pickTag`. */
  picking?: boolean
  /** Names already in the rule being filled in. */
  picked?: Set<string>
  /** The tag the rule is about, which cannot be an answer to it. */
  triggerName?: string | null
}) {
  return (
    <ul className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-4">
      {tags.map((tag) => {
        const chosen = picked?.has(tag.name) ?? false
        const trigger = picking && tag.name === triggerName

        return (
          <li key={tag.id} className="-mb-px -mr-px border-b border-r border-border">
            <button
              type="button"
              onClick={() => onSelect(tag)}
              disabled={trigger}
              title={
                trigger
                  ? `${tagLabel(tag.name)} is the tag this rule is about`
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
                {picking ? (chosen ? '✓' : trigger ? '' : '＋') : tag.post_count}
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
 * The subgroup, inside the category — `tags.category2`, whose migration has why it exists.
 *
 * Free text where the category is a menu, because there is no list to choose from: a
 * subgroup is one board's own habit about its own vocabulary, and a fixed list of them
 * would be a code change every time somebody had a new one. What keeps it from being a
 * near-duplicate factory is the datalist: the subgroups this category already uses are
 * offered as you type, so "dress color" is picked rather than typed a second way.
 *
 * Empty means none, which is what most tags are. Nothing validates the text — it is
 * lowercased and space-collapsed on the way in (`normalizeSubcategory`) and drawn as a
 * heading in the desktop picker, and nowhere else at all.
 */
function SubcategoryField({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  disabled?: boolean
}) {
  const listId = useId()

  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="dress color"
        spellCheck={false}
        className={`${FIELD} min-w-32 flex-1`}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  )
}

/**
 * Name a tag before anything carries it — an artist or a series, with the category
 * already right. This is now the only way a tag comes into being: a post write resolves
 * the names it was given and fails on one the board doesn't have, rather than coining it
 * on the way past. So the order is always this one, and the tag starts on no posts.
 */
function CreateTag({
  subcategoriesIn,
  onDone,
}: {
  subcategoriesIn: (category: TagCategory) => string[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TagCategory>('general')
  const [subcategory, setSubcategory] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const result = await window.api.createTag(name, category, subcategory)
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
        <CategoryField value={category} onChange={setCategory} />
        {/* Kept when the name is cleared below: naming five underwear tags in a row is what
            this form is for, and re-typing the subgroup each time is the thing it saves. */}
        <SubcategoryField
          value={subcategory}
          onChange={setSubcategory}
          options={subcategoriesIn(category)}
        />
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
function ApplyTag({ onDone }: { onDone: () => void }) {
  const [target, setTarget] = useState('')
  const [condition, setCondition] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setMessage(null)
    const result = await window.api.applyTagToTagged(target, condition)
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
  subcategoriesIn,
  picking,
  onPick,
  onClose,
  onDone,
}: {
  tag: Tag
  onBrowse: (query: string) => void
  subcategoriesIn: (category: TagCategory) => string[]
  picking: RuleKind | null
  onPick: (kind: RuleKind | null) => void
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(tag.name)
  const [category, setCategory] = useState<TagCategory>(tag.category)
  const [subcategory, setSubcategory] = useState(tag.category2 ?? '')
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
    if (subcategory !== (tag.category2 ?? '')) {
      const regrouped = await window.api.setTagSubcategory(tag.id, subcategory)
      if (!regrouped.ok) {
        setBusy(false)
        setError(regrouped.error)
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
    subcategory !== (tag.category2 ?? '') ||
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
        <CategoryField value={category} onChange={setCategory} disabled={busy} />
        {/* Offered from the category as currently selected, not as stored: moving a tag to
            another category and into one of *that* category's subgroups is one edit. */}
        <SubcategoryField
          value={subcategory}
          onChange={setSubcategory}
          options={subcategoriesIn(category)}
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
