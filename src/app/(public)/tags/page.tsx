import Link from 'next/link'
import type { Metadata } from 'next'
import { getTags, TAG_CATEGORIES, type TagCategory } from '@/lib/data/tags'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/components/tag-list'
import { SearchHeader } from '@/components/search-header'
import { SetupNotice } from '@/components/setup-notice'
import { isSupabaseConfigured } from '@/lib/env'
import { searchHref, tagLabel } from '@/lib/search'

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

  const groups = TAG_CATEGORIES.map(
    (category) =>
      [category, tags.filter((t) => t.category === category)] as [TagCategory, typeof tags]
  ).filter(([, group]) => group.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader />

      <h1 className="text-lg font-bold tracking-tight">Tags</h1>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No tags yet — they are created by uploads.
        </p>
      ) : (
        groups.map(([category, group]) => (
          <section key={category}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {CATEGORY_LABEL[category]} ({group.length})
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-4">
              {group.map((tag) => (
                <li key={tag.id} className="flex items-center gap-2">
                  <Link
                    href={searchHref(tag.name)}
                    className={`min-h-9 flex-1 truncate py-1 text-sm hover:underline ${CATEGORY_COLOR[category]}`}
                  >
                    {tagLabel(tag.name)}
                  </Link>
                  <span className="text-xs tabular-nums text-muted">{tag.post_count}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
