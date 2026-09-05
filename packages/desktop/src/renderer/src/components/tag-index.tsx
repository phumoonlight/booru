import { useEffect, useState } from 'react'
import {
  TAG_CATEGORIES,
  categoryColor,
  categoryLabel,
  categoryOrder,
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
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          title="Read the tag index again"
          aria-label="Refresh tags"
          className="min-h-9 text-sm text-muted transition-colors hover:text-foreground disabled:text-border"
        >
          <span aria-hidden className={loading ? 'inline-block animate-spin' : undefined}>
            🔄
          </span>
        </button>
        {/* What a cache owes you: how old it is. Time only — a list from an hour ago and
            one from Tuesday both just say "not now", and the date is never the answer to
            "should I press refresh". */}
        {fetchedAt !== null && (
          <span className="text-xs text-muted">
            as of {new Date(fetchedAt).toLocaleTimeString([], { timeStyle: 'short' })}
          </span>
        )}
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

      {panel === 'create' && <CreateTag onDone={() => void refresh()} />}
      {panel === 'apply' && <ApplyTag onDone={() => void refresh()} />}

      {editing && (
        // Keyed by the tag, so selecting another row remounts the panel with that
        // tag's name and category rather than syncing props into state after the fact.
        <EditTag
          key={editing.id}
          tag={editing}
          siteUrl={siteUrl}
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
        groups.map(([category, group]) => (
          <section key={category}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {categoryLabel(category)} ({group.length})
            </h2>
            {/* Ruled like a table, the same way the web page is: a count sitting in open
                space reads as close to the next column's name as to its own. Each cell
                carries its own right/bottom rule and is pulled a pixel over its
                neighbour so shared edges stay hairlines. */}
            <ul className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-4">
              {group.map((tag) => (
                <li key={tag.id} className="-mb-px -mr-px border-b border-r border-border">
                  <button
                    type="button"
                    onClick={() => setEditing(tag)}
                    title={`Manage ${tagLabel(tag.name)}`}
                    className={`flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface ${
                      editing?.id === tag.id ? 'bg-surface' : ''
                    } ${categoryColor(category)}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{tagLabel(tag.name)}</span>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">
                      {tag.post_count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

/** The shared shell for the three panels: a bordered card that names what it is. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
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
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={FIELD}
    >
      {TAG_CATEGORIES.map((option) => (
        <option key={option} value={option}>
          {categoryLabel(option)}
        </option>
      ))}
    </select>
  )
}

/**
 * Name a tag before anything carries it — an artist or a series, with the category
 * already right. Uploads coin tags as a side effect of applying them, so this is only
 * ever the other order, and the tag starts on no posts.
 */
function CreateTag({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TagCategory>('general')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const result = await window.api.createTag(name, category)
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
  onClose,
  onDone,
}: {
  tag: Tag
  siteUrl: string
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(tag.name)
  const [category, setCategory] = useState<TagCategory>(tag.category)
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

  const changed = name !== tag.name || category !== tag.category

  return (
    <Panel title={`${tagLabel(tag.name)} · ${tag.post_count} post${tag.post_count === 1 ? '' : 's'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
          className={`${FIELD} min-w-40 flex-1 font-mono`}
        />
        <CategoryField value={category} onChange={setCategory} disabled={busy} />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed}
          className="min-h-9 rounded-lg border border-accent px-4 text-sm text-accent transition-colors hover:bg-background disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {siteUrl && (
          <button
            type="button"
            onClick={() => void window.api.openExternal(`${siteUrl}/tags/${tag.id}`)}
            className="min-h-9 px-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            🖼️ On the board
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="min-h-9 px-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          Close
        </button>
      </div>

      {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="min-h-9 rounded-lg border border-[#ff5d5f] px-3 text-sm text-[#ff5d5f] transition-colors hover:bg-background disabled:opacity-50"
            >
              Remove from {tag.post_count} post{tag.post_count === 1 ? '' : 's'} and delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-9 px-2 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="min-h-9 px-2 text-sm text-muted transition-colors hover:text-[#ff5d5f]"
          >
            Delete tag
          </button>
        )}
      </div>
    </Panel>
  )
}
