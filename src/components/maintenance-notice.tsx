'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { checkSiteState } from '@/lib/actions/maintenance'
import { SITE_NAME } from '@/config'
import type { SiteState } from '@common/data/site'

/**
 * What the whole site is, while the switch is on.
 *
 * A page rather than a banner: there is no half-open state to describe — the desktop app
 * is either writing to the board or it isn't — and a notice over a gallery that still
 * works would be a lie either way.
 *
 * **Check status is the only control**, and it exists because of the ten-minute hold in
 * `lib/data/site.ts`: without a way to drop that, a visitor who reloads the second the
 * board comes back still waits out the rest of the window. Pressing it asks the board and
 * says what it answered — a refresh alone could land on a different serverless instance
 * with a hold of its own.
 */
/** How long Check status stays pressed, however fast the board answers. */
const CHECK_FLOOR_MS = 5000

export function MaintenanceNotice({ state }: { state: SiteState }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [checked, setChecked] = useState<SiteState | null>(null)

  const shown = checked ?? state

  function check() {
    startTransition(async () => {
      // The answer and a five-second floor, whichever is slower. A read that comes back
      // in 80ms leaves the button looking untouched — the page says the same thing it
      // said before, because nothing has changed yet — and the visitor presses it again.
      // Holding the label at "Checking…" is what makes the press legible, and it paces
      // repeat presses against the board for free.
      const [next] = await Promise.all([
        checkSiteState(),
        new Promise((resolve) => setTimeout(resolve, CHECK_FLOOR_MS)),
      ])
      // Still closed: keep the fresh copy, so a re-worded notice and a moved timestamp
      // both land without a navigation. Open again: re-render the route, which now
      // reads through a hold this call has already dropped.
      if (next.maintenance) setChecked(next)
      else router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-3 py-16 text-center sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>

      <div className="w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-6 text-sm text-yellow-400">
        <p className="flex items-center justify-center gap-2 text-base font-medium">
          <span aria-hidden>🚧</span>
          Down for maintenance
        </p>
        {/* The message is optional on purpose — the heading already says the thing that
            has to be said, so a hurried switch does not have to compose a sentence. */}
        {shown.message && <p className="mt-2 text-yellow-400/80">{shown.message}</p>}
        {shown.updatedAt > 0 && (
          <p className="mt-2 text-xs text-yellow-400/70">
            Since <Since at={shown.updatedAt} />
          </p>
        )}
      </div>

      {/* Nothing under the button. A press that finds the site still closed has nothing
          to report that the page is not already showing — the notice, and the time it was
          last decided, are the answer — and a line appearing to say so is a second thing
          to read on a page whose whole content is one sentence. */}
      <button
        type="button"
        onClick={check}
        disabled={pending}
        className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium hover:border-accent disabled:cursor-default disabled:opacity-50 disabled:hover:border-border"
      >
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            Checking
            {/* Decoration: the word beside it is what gets announced. */}
            <span aria-hidden className="inline-flex items-center gap-1">
              <span className="size-1 animate-check-dot rounded-full bg-current" />
              <span className="size-1 animate-check-dot rounded-full bg-current [animation-delay:200ms]" />
              <span className="size-1 animate-check-dot rounded-full bg-current [animation-delay:400ms]" />
            </span>
          </span>
        ) : (
          'Check status'
        )}
      </button>

    </div>
  )
}

/**
 * The moment the switch was moved, in **UTC** — the one format that is the same string on
 * the server and in the visitor's browser.
 *
 * A local-time rendering would be a hydration mismatch by construction: this page is
 * server-rendered, and the two machines are rarely in the same zone. Formatting after
 * hydration instead would mean a line that arrives late on the one page whose whole job is
 * to be static. UTC costs a visitor a subtraction and is never wrong.
 */
function Since({ at }: { at: number }) {
  const date = new Date(at)
  const text = date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })

  return <time dateTime={date.toISOString()}>{text} UTC</time>
}
