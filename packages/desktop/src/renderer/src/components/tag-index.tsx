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
import { invalidateTagNames } from './category-tag-field'

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
 * artist → copyright → character → general → meta order, A–Z inside each group, with the
 * post count in a fixed slot on the right. Same read, same cap — `listTags` in
 * `@common/data/shared` backs both.
 *
 * It is here because the uploader's real question is "does this tag already exist, and
 * under what spelling" — the autocomplete answers that one tag at a time, and there was
 * nowhere to simply look. Sorted by label rather than by count for the same reason the
 * web page is: you arrive holding a name.
 *
 * Clicking a tag opens its editor: rename it, recategorize it, delete it, or open it on
 * the board. Those were the website's /tags/manage screen until the board lost its
 * login — the site holds an anon key and the schema has no write policy for it, so the
 * vocabulary is managed here or nowhere. The two operations that are not about one
 * existing tag — creating a name up front, and applying a tag to everything already
 * carrying another — sit above the list, where they are not attached to whichever row
 * happens to be under the pointer.
 */
export function TagIndex({ siteUrl }: { siteUrl: string }) {
  const [editing, setEditing] = useState<Tag | null>(null)
  const [panel, setPanel] = useState<'none' | 'create' | 'apply'>('none')
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
    setEditing(null)
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

  const groups = categoryOrder((tags ?? []).map((tag) => tag.category))
    .map(
      (category) =>
        [
          category,
          (tags ?? [])
            .filter((tag) => tag.category === category)
            .sort((a, b) => tagLabel(a.name).localeCompare(tagLabel(b.name))),
        ] as [TagCategory, Tag[]]
    )
    .filter(([, group]) => group.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">Tags</h1>
        {/* What a cache owes you: how old it is. Time only — a list from an hour ago and
            one from Tuesday both just say "not now", and the date is never the answer to
            "should I press refresh". */}
        {fetchedAt !== null && (
          <span className="text-xs text-muted">
            as of {new Date(fetchedAt).toLocaleTimeString([], { timeStyle: 'short' })}
          </span>
        )}
        {/* Browse's Refresh, spelled the same way and in the same corner: both screens
            paint a remembered list, so the way to ask for a fresh one should not be a
            labelled button on one and a bare glyph on the other. */}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          title="Read the tag index again"
          className="ml-auto min-h-9 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-surface disabled:text-border"
        >
          <span aria-hidden className={loading ? 'inline-block animate-spin' : undefined}>
            🔄
          </span>{' '}
          Refresh
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPanel((current) => (current === 'create' ? 'none' : 'create'))}
          className={`min-h-9 rounded-lg border px-3 text-sm transition-colors hover:bg-surface ${
            panel === 'create' ? 'border-accent text-accent' : 'border-border text-muted'
          }`}
        >
          ➕ New tag
        </button>
        <button
          type="button"
          onClick={() => setPanel((current) => (current === 'apply' ? 'none' : 'apply'))}
          title="Add one tag to every post that already has another"
          className={`min-h-9 rounded-lg border px-3 text-sm transition-colors hover:bg-surface ${
            panel === 'apply' ? 'border-accent text-accent' : 'border-border text-muted'
          }`}
        >
          🧩 Apply by tag
        </button>
      </div>

      {panel === 'create' && (
        <CreateTag subcategoriesIn={subcategoriesIn} onDone={() => void refresh()} />
      )}
      {panel === 'apply' && <ApplyTag onDone={() => void refresh()} />}

      {editing && (
        // Keyed by the tag, so selecting another row remounts the panel with that
        // tag's name and category rather than syncing props into state after the fact.
        <EditTag
          key={editing.id}
          tag={editing}
          siteUrl={siteUrl}
          subcategoriesIn={subcategoriesIn}
          onClose={() => setEditing(null)}
          onDone={() => void refresh()}
        />
      )}

      {tags === null ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Loading…
        </p>
      ) : groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No tags yet — they are created by uploads.
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
                  onSelect={setEditing}
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
                    onSelect={setEditing}
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
}: {
  tags: Tag[]
  category: TagCategory
  editingId: number | null
  onSelect: (tag: Tag) => void
}) {
  return (
    <ul className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-4">
      {tags.map((tag) => (
        <li key={tag.id} className="-mb-px -mr-px border-b border-r border-border">
          <button
            type="button"
            onClick={() => onSelect(tag)}
            title={`Manage ${tagLabel(tag.name)}`}
            className={`flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface ${
              editingId === tag.id ? 'bg-surface' : ''
            } ${categoryColor(category)}`}
          >
            {/* Ahead of the name and outside the truncation, so a long tag loses its own
                tail rather than the glyph that identifies it fastest. */}
            {tag.emoji && (
              <span aria-hidden className="shrink-0 leading-none">
                {tag.emoji}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{tagLabel(tag.name)}</span>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">
              {tag.post_count}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The shared shell for the three panels: a bordered card that names what it is. */
function Panel({
  title,
  children,
  actions,
  pinned = false,
}: {
  title: string
  children: React.ReactNode
  /**
   * What the panel does *as a panel* — leave it, open it elsewhere, destroy it — beside
   * its heading rather than below its fields. They are not part of the form: Save answers
   * the two boxes, these answer the tag, and mixing the two put Close where a return key
   * lands and Delete a tab away from a text field.
   */
  actions?: React.ReactNode
  /**
   * Stay at the top of the scroller while the list moves under it. The edit panel is the
   * one that needs it: it is opened by clicking a row, and the row that sent you there can
   * be a screen and a half down a board's worth of tags — so the panel used to appear
   * somewhere you would have to scroll back up to find, and the tag you were editing was
   * off the other end of the page by the time you got there.
   *
   * Sticky rather than moving the panel down beside the row: the list is a four-column
   * grid, and a form spliced into it either breaks the columns or pushes the row you are
   * comparing against out of view. Pinned, both stay on screen at once.
   */
  pinned?: boolean
}) {
  const card = (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  )

  if (!pinned) return card

  // The gap above the card is part of what sticks, so the list scrolls *under* a strip of
  // page rather than up against the header. `-mt-4` and `pt-4` are the parent's own
  // `gap-4` taken back and reinstated as padding: at rest the spacing is unchanged, and
  // pinned it is an opaque band nothing can show through.
  return (
    <div className="sticky top-0 z-10 -mt-4 bg-background pt-4 shadow-lg shadow-background/80">
      {card}
    </div>
  )
}

const FIELD =
  'min-h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent'

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
        placeholder="subgroup (optional)"
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
 * already right. Uploads coin tags as a side effect of applying them, so this is only
 * ever the other order, and the tag starts on no posts.
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
          placeholder="tag_name"
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
          className="min-h-9 rounded-lg border border-accent px-4 text-sm text-accent transition-colors hover:bg-background disabled:opacity-50"
        >
          Create
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
          placeholder="tag to add"
          spellCheck={false}
          className={`${FIELD} min-w-32 flex-1 font-mono`}
        />
        <span className="text-xs text-muted">to every post tagged</span>
        <input
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          placeholder="existing tag"
          spellCheck={false}
          className={`${FIELD} min-w-32 flex-1 font-mono`}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !target.trim() || !condition.trim()}
          className="min-h-9 rounded-lg border border-accent px-4 text-sm text-accent transition-colors hover:bg-background disabled:opacity-50"
        >
          {busy ? 'Applying…' : 'Apply'}
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
  siteUrl,
  subcategoriesIn,
  onClose,
  onDone,
}: {
  tag: Tag
  siteUrl: string
  subcategoriesIn: (category: TagCategory) => string[]
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(tag.name)
  const [category, setCategory] = useState<TagCategory>(tag.category)
  const [subcategory, setSubcategory] = useState(tag.category2 ?? '')
  const [emoji, setEmoji] = useState(tag.emoji ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

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
    if (emoji !== (tag.emoji ?? '')) {
      const marked = await window.api.setTagEmoji(tag.id, emoji)
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
    emoji !== (tag.emoji ?? '')

  return (
    <Panel
      pinned
      title={`${tagLabel(tag.name)} · ${tag.post_count} post${tag.post_count === 1 ? '' : 's'}`}
      actions={
        <>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy || confirming}
            className="min-h-8 px-2 text-xs text-muted transition-colors hover:text-[#ff5d5f] disabled:opacity-40"
          >
            🗑️ Delete tag
          </button>
          {siteUrl && (
            <button
              type="button"
              onClick={() => void window.api.openExternal(`${siteUrl}/tags/${tag.id}`)}
              className="min-h-8 px-2 text-xs text-muted transition-colors hover:text-foreground"
            >
              🖼️ On the board
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-8 px-2 text-xs text-muted transition-colors hover:text-foreground"
          >
            ❌ Close
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* In front of the name, where what it holds is drawn. One glyph wide and no
            wider: the field is the size of the thing it takes, which says more about what
            belongs in it than a placeholder would, and an empty box clears the column. */}
        <input
          value={emoji}
          onChange={(event) => setEmoji(event.target.value)}
          disabled={busy}
          aria-label={`Emoji in front of ${tagLabel(tag.name)}`}
          title="One emoji, drawn in front of the name. Empty for none."
          spellCheck={false}
          className={`${FIELD} w-14 shrink-0 px-0 text-center`}
        />
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
          className="min-h-9 rounded-lg border border-accent px-4 text-sm text-accent transition-colors hover:bg-background disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

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
