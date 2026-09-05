import type { Metadata } from 'next'
import { SearchHeader } from '@/components/search-header'
import { NsfwToggle } from '@/components/nsfw-toggle'
import { isNsfwEnabled } from '@/lib/nsfw-server'
import { RATING_COLOR } from '@common/search'
import { SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Settings',
  description: `Browsing preferences for ${SITE_NAME}.`,
  alternates: { canonical: '/settings' },
  // Nothing here is content, and the page reads a cookie — there is nothing for a
  // crawler to index and no stable version of it to index anyway.
  robots: { index: false, follow: false },
}

/**
 * Preferences, all of which live in this browser. There is no account to hang them on
 * and no table to write them to — the site is read-only — so a setting here is a cookie
 * or nothing.
 */
export default async function SettingsPage() {
  const nsfw = await isNsfwEnabled()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 py-4">
      {/* No search box: this page is not a listing, and the nav above it is the part
          every page still needs. */}
      <SearchHeader showSearch={false} />

      <h1 className="text-lg font-bold tracking-tight">Settings</h1>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div>
          {/* The scale's own red, so the heading is the colour of what it turns on */}
          <h2 className={`text-base font-semibold ${RATING_COLOR.e}`}>Enable NSFW</h2>
          <p className="mt-1 text-sm text-muted">
            Adult posts are hidden by default. Turn this on to see them everywhere on the
            site.
          </p>
        </div>

        <NsfwToggle enabled={nsfw} />
      </section>

      <p className="text-xs text-muted">
        Saved in this browser only.
      </p>
    </div>
  )
}
