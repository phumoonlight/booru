import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SearchHeader } from '@/components/search-header'
import { SetupNotice } from '@/components/setup-notice'
import { UploadZone } from '@/components/upload-zone'
import { getCurrentProfile } from '@/lib/data/profiles'
import { isSupabaseConfigured } from '@/lib/env'

// Sign-in-only tool — nothing here for crawlers.
export const metadata: Metadata = {
  title: 'Upload',
  robots: { index: false, follow: false },
}

export default async function UploadPage() {
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

  // The proxy guards no routes, so the page checks the session itself.
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader />
      <div className="mx-auto w-full max-w-md">
        <h1 className="mb-4 text-lg font-bold tracking-tight">Upload</h1>
        <UploadZone />
      </div>
    </div>
  )
}
