import { useEffect, useState } from 'react'
import { CATEGORY_COLOR, CATEGORY_LABEL, TAG_CATEGORIES, type Tag } from '@web/lib/tags'
import { tagLabel } from '@web/lib/search'

/**
 * The board's tags, as the website's /tags page draws them: grouped by category in
 * artist → copyright → character → general → meta order, A–Z inside each group, with the
 * post count in a fixed slot on the right. Same read, same cap — `listTags` in
 * `lib/data/shared.ts` backs both.
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
  const [tags, setTags] = useState<Tag[] | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.listTags().then((next) => {
      if (alive) setTags(next)
    })
    return () => {
      alive = false
    }
  }, [])

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
      <h1 className="text-lg font-bold tracking-tight">Tags</h1>

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
