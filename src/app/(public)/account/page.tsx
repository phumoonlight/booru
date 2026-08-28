import Link from 'next/link'
import type { Metadata } from 'next'
import { getCurrentEmail, getCurrentProfile } from '@/lib/data/profiles'
import { ChangeUsername } from '@/components/change-username'
import { SearchHeader } from '@/components/search-header'
import { SetupNotice } from '@/components/setup-notice'
import { isSupabaseConfigured } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Account',
  description: 'View and change your username.',
  // One person's own settings screen: nothing here belongs in search results
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
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
  const email = profile ? await getCurrentEmail() : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SearchHeader />

      <h1 className="text-lg font-bold tracking-tight">Account</h1>

      {profile ? (
        // Narrower than the page: a single field reads badly stretched across a desktop width
        <div className="flex max-w-sm flex-col gap-4">
          {/*
            Read-only, and deliberately outside ChangeUsername's <form> — the address
            can only change through Supabase's own confirm-both-ends flow, so keeping
            it out of the form means there is no field for a save to carry along.
          */}
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            Email
            <input
              value={email ?? '—'}
              disabled
              readOnly
              aria-describedby="email-note"
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-muted"
            />
          </label>
          <p id="email-note" className="-mt-2 text-xs text-muted">
            Your login address. It can&rsquo;t be changed here.
          </p>

          <ChangeUsername username={profile.username} />
          <dl className="flex justify-between border-t border-border pt-3 text-sm text-muted">
            <dt>Member since</dt>
            <dd>
              {new Date(profile.created_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </dd>
          </dl>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>{' '}
          to see your account.
        </p>
      )}
    </div>
  )
}
