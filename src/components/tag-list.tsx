import Link from 'next/link'
import { TAG_CATEGORIES, type Tag, type TagCategory } from '@/lib/data/tags'
import { searchHref, tagLabel, withTag } from '@/lib/search'

// Danbooru-style category colours, tuned for the dark theme
const CATEGORY_COLOR: Record<TagCategory, string> = {
  artist: 'text-[#ff8a8b]',
  copyright: 'text-[#c797ff]',
  character: 'text-[#35c64a]',
  general: 'text-[#4fa3e3]',
  meta: 'text-[#ead084]',
}

const CATEGORY_LABEL: Record<TagCategory, string> = {
  artist: 'Artist',
  copyright: 'Copyright',
  character: 'Character',
  general: 'General',
  meta: 'Meta',
}

export type TagEntry = { tag: Tag; count: number }

/**
 * A tag row: tapping the name searches for it (added to any current query),
 * the − button excludes it instead.
 */
function TagRow({ entry, currentQuery }: { entry: TagEntry; currentQuery: string }) {
  const { tag, count } = entry
  return (
    <li className="flex items-center gap-1">
      <Link
        href={searchHref(withTag(currentQuery, tag.name, 'exclude'))}
        aria-label={`Exclude ${tag.name}`}
        className="flex min-h-9 w-6 items-center justify-center text-sm text-muted hover:text-red-400"
      >
        −
      </Link>
      <Link
        href={searchHref(withTag(currentQuery, tag.name))}
        className={`min-h-9 flex-1 py-1 text-sm hover:underline ${CATEGORY_COLOR[tag.category]}`}
      >
        {tagLabel(tag.name)}
      </Link>
      <span className="text-xs tabular-nums text-muted">{count}</span>
    </li>
  )
}

/** Flat list, already ordered by the caller. Used by the sidebar/drawer. */
export function TagList({
  entries,
  currentQuery = '',
}: {
  entries: TagEntry[]
  currentQuery?: string
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted">No tags here.</p>
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <TagRow key={entry.tag.id} entry={entry} currentQuery={currentQuery} />
      ))}
    </ul>
  )
}

/** Sectioned by category in Danbooru order. Used on the post detail page. */
export function GroupedTagList({
  entries,
  currentQuery = '',
}: {
  entries: TagEntry[]
  currentQuery?: string
}) {
  const groups = TAG_CATEGORIES.map(
    (category) => [category, entries.filter((e) => e.tag.category === category)] as const
  ).filter(([, group]) => group.length > 0)

  if (groups.length === 0) {
    return <p className="text-sm text-muted">No tags on this post.</p>
  }

  return (
    <div className="flex flex-col gap-4">
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

export { CATEGORY_COLOR, CATEGORY_LABEL }
