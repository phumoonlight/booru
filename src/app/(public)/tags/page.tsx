import Link from 'next/link'
import type { Metadata } from 'next'
import { getTags } from '@/lib/data/tags'
import { categoryOrder, type TagCategory } from '@common/tags'
import { categoryColor, categoryLabel, TagEmoji } from '@/components/tag-list'
import { SearchHeader } from '@/components/search-header'
import { NavProgress } from '@/components/nav-progress'
import { SetupNotice } from '@/components/setup-notice'
import { isSupabaseConfigured } from '@/lib/env'
import { tagLabel } from '@common/search'

export const metadata: Metadata = {
  title: 'Tags',
  description: 'Every tag on the board, grouped by category and sorted by post count.',
  alternates: { canonical: '/tags' },
  openGraph: { url: '/tags', title: 'Tags' },
}

export default async function TagsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SearchHeader />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const tags = await getTags(500)

  // A–Z within each category, like the facets and the manage screen. The read above
  // orders by post_count and that is what decides which tags the cap lets through, but
  // this page is an index: you arrive holding a name, and a tag's size says nothing about
  // where to look for it. Sorted by the label, since the underscores are not on screen.
  const groups = categoryOrder(tags.map((t) => t.category)).map(
    (category) =>
      [
        category,
        tags
          .filter((t) => t.category === category)
          .sort((a, b) => tagLabel(a.name).localeCompare(tagLabel(b.name))),
      ] as [TagCategory, typeof tags]
  ).filter(([, group]) => group.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">Tags</h1>
        {/* No manage link: renaming, recategorizing and deleting tags are the desktop
            app's, along with every other write. */}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No tags yet — they are created by uploads.
        </p>
      ) : (
        groups.map(([category, group]) => (
          <section key={category}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {categoryLabel(category)} ({group.length})
            </h2>
            {/* Ruled like a table rather than spaced apart: a count sitting in open space
                was as close to the next column's name as to its own, and no gap says
                "these two belong together" as plainly as a line saying where the cell
                ends. Each cell carries its own right/bottom rule and is pulled a pixel
                over its neighbour so shared edges stay hairlines; the frame closes the
                last row when it comes up short. The count keeps its fixed right-aligned
                slot, so the numbers still line up down each column. */}
            <ul className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-4">
              {group.map((tag) => (
                <li key={tag.id} className="-mb-px -mr-px border-b border-r border-border">
                  <Link
                    href={`/tags/${tag.id}`}
                    className={`flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface ${categoryColor(category)}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <TagEmoji emoji={tag.emoji} />
                      {tagLabel(tag.name)}
                    </span>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">
                      {tag.post_count}
                    </span>
                    <NavProgress />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
