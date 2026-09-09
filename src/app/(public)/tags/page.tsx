import Link from 'next/link'
import type { Metadata } from 'next'
import { browseTags } from '@/lib/data/tags'
import { categoryLabel } from '@/components/tag-list'
import { TagTable } from '@/components/tag-table'
import { SearchHeader } from '@/components/search-header'
import { NavProgress } from '@/components/nav-progress'
import { SetupNotice } from '@/components/setup-notice'
import { isDatabaseConfigured } from '@/lib/db'
import { readParam, readShown, tagsHref } from '@/lib/tags-url'

export const metadata: Metadata = {
  title: 'Tags',
  description: 'Every tag on the board, with its post count and category.',
  alternates: { canonical: '/tags' },
  openGraph: { url: '/tags', title: 'Tags' },
}

export default async function TagsPage({ searchParams }: PageProps<'/tags'>) {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-4">
        <SearchHeader />
        <div className="pt-4">
          <SetupNotice />
        </div>
      </div>
    )
  }

  const params = await searchParams
  const find = readParam(params.find)
  const category = readParam(params.category)
  const shown = readShown(params.show)

  const page = await browseTags({ find, category, limit: shown })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-3 py-4">
      <SearchHeader />

      {/* No manage link: renaming, recategorizing and deleting tags are the desktop
          app's, along with every other write. The count is under the table, beside Show
          more, where it says how far down the list you are rather than repeating a total
          the table is about to give you again. */}
      <h1 className="text-lg font-bold tracking-tight">Tags</h1>

      {/* A plain GET form, so the filter works with no JavaScript and the result is an
          address you can keep. The category rides along in a hidden field: the two are
          independent filters and narrowing within a heading is the ordinary thing to
          want. `show` deliberately does not, so a new filter opens at ten rows again.

          The placeholder is an example rather than a description — the heading above
          already says these are tags, and `blue_hair` shows the underscores in one go. */}
      <form action="/tags" method="get" className="flex gap-2">
        {category && <input type="hidden" name="category" value={category} />}
        <input
          type="search"
          name="find"
          defaultValue={find}
          placeholder="blue_hair"
          aria-label="Filter tags by name"
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm transition-colors hover:border-accent"
        >
          Filter
        </button>
      </form>

      {/* What the table is currently narrowed to, and the way back out. Only drawn when
          something is on, so an unfiltered index carries no chrome it doesn't need. */}
      {(find || category) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            Showing
            {category ? ` ${categoryLabel(category)}` : ' every category'}
            {find ? ` matching “${find}”` : ''}
          </span>
          <Link href={category && find ? tagsHref({ find }) : '/tags'} className="text-accent hover:underline">
            {category && find ? 'Every category' : 'Clear'}
            <NavProgress />
          </Link>
        </p>
      )}

      {/* Keyed on the filters so a navigation resets the accumulated rows — without it,
          Show more's chunks from the previous filter would still be on screen under a
          server render of the new one. */}
      <TagTable
        key={`${find}|${category}|${shown}`}
        initialTags={page.tags}
        find={find}
        category={category}
        total={page.total}
        hasMore={page.hasMore}
      />
    </div>
  )
}
