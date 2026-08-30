import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { CATEGORY_COLOR, CATEGORY_LABEL, TAG_CATEGORIES, type Tag } from '@/lib/tags'
import { parseSearchQuery, searchHref, tagLabel, withTag, withoutTag } from '@/lib/search'


/**
 * ➕/➖ share the count's slot on the right: the count fades out and the buttons take its
 * place while the row is hovered or keyboard-focused, so a resting list is just names and
 * numbers. Coarse pointers have no hover, so there the buttons sit beside the count.
 */
export function FacetActions({
  count,
  plus,
  minus,
}: {
  count: number
  plus: { href: string; label: string; on: boolean }
  minus: { href: string; label: string; on: boolean }
}) {
  // Emoji ignore `color`, so an off button is desaturated and brightened instead — against
  // a near-black background that lands it around `--muted`, where fading it with opacity
  // would only sink it into the background. Hover restores the glyph's own colour.
  const button = (on: boolean) =>
    `pointer-fine:min-h-7 flex min-h-9 w-6 items-center justify-center text-xs transition-[filter] ${
      on ? '' : 'brightness-150 grayscale hover:brightness-100 hover:grayscale-0'
    }`

  return (
    <span className="pointer-fine:min-h-7 relative flex min-h-9 items-center justify-end">
      <span className="pointer-coarse:opacity-100 text-xs tabular-nums text-muted transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
        {count}
      </span>
      <span className="pointer-coarse:relative pointer-coarse:ml-1 pointer-coarse:opacity-100 absolute right-0 flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Link href={plus.href} aria-label={plus.label} className={button(plus.on)}>
          ➕
          <NavProgress />
        </Link>
        <Link href={minus.href} aria-label={minus.label} className={button(minus.on)}>
          ➖
          <NavProgress />
        </Link>
      </span>
    </span>
  )
}

export type TagEntry = { tag: Tag; count: number }

/**
 * A tag row: tapping the name replaces the whole query with just this tag — one filter,
 * nothing carried over — while the hover-revealed ➕/➖ add it to the current search or
 * exclude it. Both toggle: pressing the one already on removes the tag again.
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
        className={`pointer-fine:min-h-7 min-h-9 flex-1 py-1 text-sm hover:underline ${CATEGORY_COLOR[tag.category]} ${
          included ? 'font-semibold underline' : ''
        } ${excluded ? 'line-through opacity-60' : ''}`}
      >
        {label}
        <NavProgress />
      </Link>
      <FacetActions
        count={count}
        plus={{
          href: searchHref(
            included ? withoutTag(currentQuery, tag.name) : withTag(currentQuery, tag.name)
          ),
          label: included ? `Remove ${label} from the search` : `Add ${label} to the search`,
          on: included,
        }}
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
 * Sectioned by category in Danbooru order, entries already ordered by the caller within
 * each one. Used by the sidebar/drawer facets and the post detail page.
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
  const groups = TAG_CATEGORIES.map(
    (category) => [category, entries.filter((e) => e.tag.category === category)] as const
  ).filter(([, group]) => group.length > 0)

  if (groups.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>
  }

  return (
    <div className="pointer-fine:gap-3 flex flex-col gap-4">
      {groups.map(([category, group]) => (
        <section key={category}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {CATEGORY_LABEL[category]}
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
export { CATEGORY_COLOR, CATEGORY_LABEL }
