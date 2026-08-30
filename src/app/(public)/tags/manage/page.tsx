import Link from 'next/link'
import type { Metadata } from 'next'
import { getTags } from '@/lib/data/tags'
import { getCurrentProfile } from '@/lib/data/profiles'
import { ManageTags } from '@/components/manage-tags'
import { SearchHeader } from '@/components/search-header'
import { SetupNotice } from '@/components/setup-notice'
import { isSupabaseConfigured } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Manage tags',
  description: 'Create, rename, recategorize and delete tags.',
  // A signed-in-only screen: nothing here belongs in search results
  robots: { index: false, follow: false },
}

export default async function ManageTagsPage() {
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

  const profile = await getCurrentProfile()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">Manage tags</h1>
        <Link href="/tags" className="text-sm text-muted hover:text-foreground">
          🏷️ All tags
        </Link>
      </div>

      {profile ? (
        <ManageTags tags={await getTags(500)} />
      ) : (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>{' '}
          to create, rename and recategorize tags.
        </p>
      )}
    </div>
  )
}
