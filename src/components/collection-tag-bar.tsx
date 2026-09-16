import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { TagMark } from '@/components/tag-mark'
import type { CollectionTag } from '@/lib/data/collection-tags'
import { collectionHref, toggleCollectionTag } from '@common/collections'
import { tagLabel } from '@common/search'

const PILL =
  'flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors sm:min-h-9'

/**
 * A shelf's own tags, above its images, each one a pill that narrows the shelf to the
 * images carrying it. Lit pills combine: two lit is the images carrying both.
 *
 * **Links, not buttons.** A press is a navigation to `collectionHref(id, tags)`, and the page
 * reads the same list back out of its URL — so a filtered shelf is an address that can be
 * shared, bookmarked and gone back from, and the bar works without JavaScript, the way the
 * shelf list's search does. `toggleCollectionTag` is what a press means, spelled beside the
 * href it builds.
 *
 * A name in the URL that this shelf has no tag for is still drawn, lit and counted at
 * nothing, so a hand-edited or out-of-date link can be undone from the bar instead of
 * leaving an empty grid with no visible reason.
 */
export function CollectionTagBar({
  collectionId,
  tags,
  active,
}: {
  collectionId: number
  tags: CollectionTag[]
  active: string[]
}) {
  const known = new Set(tags.map((tag) => tag.name))
  const pills = [
    ...tags,
    ...active
      .filter((name) => !known.has(name))
      .map((name) => ({ id: -1, name, mark: null, post_count: 0 })),
  ]
  if (pills.length === 0) return null

  return (
    <nav aria-label="Filter by tag" className="flex flex-wrap items-center gap-1.5">
      {pills.map((tag) => {
        const on = active.includes(tag.name)
        return (
          <Link
            key={tag.name}
            href={collectionHref(collectionId, toggleCollectionTag(active, tag.name))}
            aria-current={on ? 'true' : undefined}
            className={`${PILL} ${
              on
                ? 'border-accent bg-accent text-background'
                : 'border-border text-muted hover:border-muted hover:text-foreground'
            }`}
          >
            <TagMark mark={tag.mark} />
            {tagLabel(tag.name)}
            <span className={on ? 'text-background/70' : 'text-muted/70'}>{tag.post_count}</span>
            <NavProgress />
          </Link>
        )
      })}
      {active.length > 0 && (
        <Link
          href={collectionHref(collectionId)}
          className="flex min-h-11 items-center px-2 text-sm text-muted hover:text-foreground hover:underline sm:min-h-9"
        >
          <span aria-hidden>✕</span>&nbsp;Clear
          <NavProgress />
        </Link>
      )}
    </nav>
  )
}
