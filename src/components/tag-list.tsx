import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { categoryColor, categoryLabel, categoryOrder, type Tag } from '@common/tags'
import { parseSearchQuery, searchHref, tagLabel, withTag, withoutTag } from '@common/search'


/**
 * ➕/➖ share the count's slot on the right: the count fades out and the buttons take its
 * place while the row is hovered or keyboard-focused, so a resting list is just names and
 * numbers. Coarse pointers have no hover, so there the buttons sit beside the count.
 *
 * `plus` is optional because on an empty search it has nothing of its own to do: adding a
 * tag to no query and replacing no query with that tag are the same search, and the tag's
 * own name already does it. Offering both put two controls on a row for one outcome, and
 * the smaller of the two was the one that looked like the real button.
 */
export function FacetActions({
  count,
  plus,
  minus,
}: {
  /** Optional: a facet with no counter behind it renders the buttons without one. */
  count?: number
  plus?: { href: string; label: string; on: boolean }
  minus: { href: string; label: string; on: boolean }
}) {
  // Emoji ignore `color`, so an off button is desaturated and brightened instead — against
  // a near-black background that lands it around `--muted`, where fading it with opacity
  // would only sink it into the background. Hover restores the glyph's own colour.
  const button = (on: boolean) =>
    `pointer-fine:min-h-7 flex min-h-9 w-6 items-center justify-center text-xs transition-[filter] ${
      on ? '' : 'brightness-150 grayscale hover:brightness-100 hover:grayscale-0'
    }`

  // With no count to sit behind, the buttons have nothing to reveal themselves from
  // under, so they are simply always on screen rather than waiting for a hover that
  // would leave the row looking empty until it came.
  const bare = count === undefined

  return (
    <span className="pointer-fine:min-h-7 relative flex min-h-9 items-center justify-end">
      {!bare && (
        <span className="pointer-coarse:opacity-100 text-xs tabular-nums text-muted transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
          {count}
        </span>
      )}
      <span
        className={
          bare
            ? 'ml-1 flex items-center'
            : 'pointer-coarse:relative pointer-coarse:ml-1 pointer-coarse:opacity-100 absolute right-0 flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'
        }
      >
        {plus && (
          <Link href={plus.href} aria-label={plus.label} className={button(plus.on)}>
            ➕
            <NavProgress />
          </Link>
        )}
        <Link href={minus.href} aria-label={minus.label} className={button(minus.on)}>
          ➖
          <NavProgress />
        </Link>
      </span>
    </span>
  )
}

/**
 * The glyph a tag carries in front of its name — `tags.emoji`, set per tag in the desktop
 * app and null for most of them, which is why this renders nothing rather than a space.
 *
 * `aria-hidden`, like every emoji on the site: it is decoration in front of a name the
 * screen reader is about to read anyway, and "woman's briefs" announced ahead of
 * `panties` is worse than silence.
 *
 * Inline with a margin rather than a flex child, so it goes in front of the label text
 * itself wherever a tag is drawn — including inside a truncating cell, where sitting at
 * the head of the string is what keeps it out of the ellipsis.
 */
export function TagEmoji({ emoji }: { emoji: string | null }) {
  if (!emoji) return null
  return (
    <span aria-hidden className="mr-1">
      {emoji}
    </span>
  )
}

export type TagEntry = { tag: Tag; count: number }

/**
 * A tag row: tapping the name replaces the whole query with just this tag — one filter,
 * nothing carried over — while the hover-revealed ➕/➖ add it to the current search or
 * exclude it. Both toggle: pressing the one already on removes the tag again.
 *
 * ➕ appears only once something is being searched for, since with an empty query it is
 * the tag's own name spelled a second way. ➖ stays either way: `-tag` on nothing is
 * everything *except* this, which no other control on the row says.
 *
 * `min-h-9` buys a thumb-sized target, but a mouse doesn't need one and the slack reads as
 * a gappy list, so fine pointers get rows just tall enough for the text.
 */
function TagRow({ entry, currentQuery }: { entry: TagEntry; currentQuery: string }) {
  const { tag, count } = entry
  const { include, exclude } = parseSearchQuery(currentQuery)
  const included = include.includes(tag.name)
  const excluded = exclude.includes(tag.name)
  const label = tagLabel(tag.name)

  return (
    <li className="group flex items-center gap-1">
      <Link
        href={searchHref(tag.name)}
        aria-label={`Search only ${label}`}
        className={`pointer-fine:min-h-7 min-h-9 flex-1 py-1 text-sm hover:underline ${categoryColor(tag.category)} ${
          included ? 'font-semibold underline' : ''
        } ${excluded ? 'line-through opacity-60' : ''}`}
      >
        <TagEmoji emoji={tag.emoji} />
        {label}
        <NavProgress />
      </Link>
      <FacetActions
        count={count}
        plus={
          currentQuery.trim()
            ? {
                href: searchHref(
                  included ? withoutTag(currentQuery, tag.name) : withTag(currentQuery, tag.name)
                ),
                label: included
                  ? `Remove ${label} from the search`
                  : `Add ${label} to the search`,
                on: included,
              }
            : undefined
        }
        minus={{
          href: searchHref(
            excluded
              ? withoutTag(currentQuery, tag.name)
              : withTag(currentQuery, tag.name, 'exclude')
          ),
          label: excluded ? `Stop excluding ${label}` : `Exclude ${label}`,
          on: excluded,
        }}
      />
    </li>
  )
}

/**
 * Sectioned by category in Danbooru order, A–Z within each one. The caller's order still
 * matters — it decides which tags survive a facet list's cap — but once a set is on
 * screen a name is looked up by reading down the column, so alphabetical is the order to
 * read it in. Used by the sidebar/drawer facets and the post detail page.
 */
export function GroupedTagList({
  entries,
  currentQuery = '',
  empty = 'No tags here.',
}: {
  entries: TagEntry[]
  currentQuery?: string
  empty?: string
}) {
  const groups = categoryOrder(entries.map((e) => e.tag.category)).map(
    (category) =>
      [
        category,
        entries
          // Sorted by the label rather than the raw name, so the underscores the reader
          // never sees can't push a row out of the order the column appears to be in
          .filter((e) => e.tag.category === category)
          .sort((a, b) => tagLabel(a.tag.name).localeCompare(tagLabel(b.tag.name))),
      ] as const
  ).filter(([, group]) => group.length > 0)

  if (groups.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>
  }

  return (
    <div className="pointer-fine:gap-3 flex flex-col gap-4">
      {groups.map(([category, group]) => (
        <section key={category}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {categoryLabel(category)}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {group.map((entry) => (
              <TagRow key={entry.tag.id} entry={entry} currentQuery={currentQuery} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// Re-exported so the components that paint tags keep one import for the whole set
export { categoryColor, categoryLabel }
