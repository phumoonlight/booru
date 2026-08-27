import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SearchHeader } from '@/components/search-header'
import { SetupNotice } from '@/components/setup-notice'
import { UploadZone } from '@/components/upload-zone'
import { getCurrentProfile } from '@/lib/data/profiles'
import { isSupabaseConfigured } from '@/lib/env'

// Admin-only tool — nothing here for crawlers.
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

  // The proxy guards no routes, so the page checks the role itself. Non-admins are
  // sent home rather than shown a 403 — the button that leads here is admin-only.
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

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
