'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { TagMark, categoryColor, categoryLabel } from '@/components/tag-list'
import { loadMoreTags } from '@/lib/actions/tags'
import { TAGS_PER_PAGE, tagsHref } from '@/lib/tags-url'
import type { Tag } from '@common/tags'
import { tagLabel } from '@common/search'

/**
 * The vocabulary as a table: name, post count, category, ten rows at a time.
 *
 * It was every tag on the board at once, in category sections of four-across cells. That
 * page had no way to be about one thing — a board with a few hundred tags rendered all of
 * them whatever you came for, and the count sat in a cell you had to aim at rather than a
 * column you could read down. Three columns and a filter box is the same information
 * answering a question.
 *
 * **The form section is not among the columns and will not be.** Which row of the desktop
 * upload form a tag sits on is a fact about that form, decided on the desktop Tags screen
 * with the whole vocabulary in front of you; the website shows the category, which is what
 * a tag *is*. `listTags` embeds the section because the desktop needs it — this page just
 * doesn't draw it.
 *
 * Show more is a real `<a href="?show=20">` with its click intercepted, the bargain the
 * gallery's feed already strikes: a crawler and a browser without JS follow the link and
 * get the same rows the button would have appended, and nobody else pays a navigation.
 * There is no auto-loading sentinel — this is an index you scan and leave, not a feed you
 * fall down, and a table that grew as you read it would move the row you were aiming at.
 */
export function TagTable({
  initialTags,
  find,
  category,
  total,
  hasMore: initialHasMore,
}: {
  initialTags: Tag[]
  find: string
  category: string
  total: number
  hasMore: boolean
}) {
  const [tags, setTags] = useState(initialTags)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    if (pending || !hasMore) return

    setPending(true)
    setFailed(false)
    try {
      const next = await loadMoreTags({ find, category, offset: tags.length })
      setHasMore(next.hasMore)
      setTags((current) => [...current, ...next.tags])
    } catch {
      // The link underneath still works, so a dropped connection costs a navigation
      // rather than the rest of the list.
      setFailed(true)
    } finally {
      setPending(false)
    }
  }, [category, find, hasMore, pending, tags.length])

  if (tags.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
        {find || category ? (
          <>
            Nothing matches that.{' '}
            <Link href="/tags" className="text-accent hover:underline">
              Show every tag
            </Link>
          </>
        ) : (
          'No tags yet — they are named in the desktop app.'
        )}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Ruled rows rather than spaced ones, for the reason the old grid was: a count
          sitting in open space is as close to the next row's name as to its own. */}
      <table className="w-full table-fixed border-collapse overflow-hidden rounded-lg border border-border text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Tag
            </th>
            <th scope="col" className="w-16 px-3 py-2 text-right font-semibold">
              Posts
            </th>
            <th scope="col" className="w-28 px-3 py-2 text-right font-semibold sm:w-40">
              Category
            </th>
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) => {
            const label = tagLabel(tag.name)
            const active = tag.category === category

            return (
              <tr key={tag.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-0">
                  <Link
                    href={`/tags/${tag.id}`}
                    className={`flex min-h-11 items-center truncate hover:underline sm:min-h-9 ${categoryColor(tag.category)}`}
                  >
                    <TagMark mark={tag.mark} />
                    {label}
                    <NavProgress />
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{tag.post_count}</td>
                <td className="px-3 py-0 text-right">
                  {/* The whole point of the column being a control: the tag in front of
                      you is the one that tells you which heading you actually wanted, and
                      pressing it puts the table on that heading rather than making you go
                      back up to a filter row and find it by name. Pressing the one already
                      on takes the filter off again, so the column never becomes a trap. */}
                  <Link
                    href={tagsHref({ find, category: active ? '' : tag.category })}
                    aria-label={
                      active
                        ? `Show every category again`
                        : `Show only ${categoryLabel(tag.category)} tags`
                    }
                    className={`flex min-h-11 items-center justify-end truncate text-xs hover:underline sm:min-h-9 ${
                      active ? 'text-accent' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {categoryLabel(tag.category)}
                    <NavProgress />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>
          {tags.length} of {total}
        </span>
        {hasMore && (
          <a
            href={tagsHref({ find, category, show: tags.length + TAGS_PER_PAGE })}
            onClick={(event) => {
              // Plain left-click only — cmd/ctrl-click still opens the longer page in a
              // tab, which is the point of it being a link.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
              event.preventDefault()
              load()
            }}
            rel="next"
            aria-busy={pending}
            className="flex min-h-11 items-center rounded-lg border border-border bg-surface px-6 text-sm text-foreground transition-colors hover:border-accent"
          >
            {pending ? 'Loading…' : failed ? 'Failed to load — try again' : 'Show more'}
          </a>
        )}
      </div>
    </div>
  )
}
