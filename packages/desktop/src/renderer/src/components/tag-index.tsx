import { useEffect, useState } from 'react'
import { CATEGORY_COLOR, CATEGORY_LABEL, TAG_CATEGORIES, type Tag } from '@common/tags'
import { tagLabel } from '@common/search'

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
 * A tag opens on the board rather than in this window. There is no gallery here to show
 * it in, and the app already sends finished posts to the browser the same way.
 */
export function TagIndex({ siteUrl }: { siteUrl: string }) {
  const [tags, setTags] = useState<Tag[] | null>(cached?.tags ?? null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(cached?.at ?? null)
  const [loading, setLoading] = useState(false)

  // Only when there is nothing to show. Coming back to this screen paints the list it
  // painted last time, and the 🔄 beside the title is how you ask for a new one.
  useEffect(() => {
    if (cached) return
    let alive = true
    setLoading(true)
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
    setLoading(true)
    const next = await window.api.listTags()
    cached = { tags: next, at: Date.now() }
    setTags(next)
    setFetchedAt(cached.at)
    setLoading(false)
  }

  const groups = TAG_CATEGORIES.map(
    (category) =>
      [
        category,
        (tags ?? [])
          .filter((tag) => tag.category === category)
          .sort((a, b) => tagLabel(a.name).localeCompare(tagLabel(b.name))),
      ] as [(typeof TAG_CATEGORIES)[number], Tag[]]
  ).filter(([, group]) => group.length > 0)

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
              {CATEGORY_LABEL[category]} ({group.length})
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
                    disabled={!siteUrl}
                    onClick={() => void window.api.openExternal(`${siteUrl}/tags/${tag.id}`)}
                    title={siteUrl ? `Open ${tagLabel(tag.name)} on the board` : tag.name}
                    className={`flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface disabled:hover:bg-transparent ${CATEGORY_COLOR[category]}`}
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
