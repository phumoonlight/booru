'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { NSFW_COOKIE, NSFW_COOKIE_MAX_AGE, NSFW_COOKIE_VALUE } from '@/lib/nsfw'
import { RATING_COLOR, RATING_LABEL, RESTRICTED_RATINGS } from '@common/search'

/**
 * The one setting the site has. It writes the cookie from the client — the server
 * renders the current value, and there is no action behind this because the site has no
 * write path and this is a preference the browser is entitled to set for itself.
 *
 * `router.refresh()` after the write is what makes the change visible: the listing is an
 * RSC that read the cookie, so nothing on screen changes until the server renders again.
 */
export function NsfwToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)

  const set = (next: boolean) => {
    setOn(next)
    document.cookie = next
      ? `${NSFW_COOKIE}=${NSFW_COOKIE_VALUE}; path=/; max-age=${NSFW_COOKIE_MAX_AGE}; samesite=lax`
      : `${NSFW_COOKIE}=; path=/; max-age=0; samesite=lax`
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => set(event.target.checked)}
          className="size-4 accent-accent"
        />
        <span className="text-sm">
          Show{' '}
          {RESTRICTED_RATINGS.map((rating, index) => (
            <span key={rating}>
              {index > 0 && ' and '}
              <span className={RATING_COLOR[rating]}>{RATING_LABEL[rating]}</span>
            </span>
          ))}{' '}
          posts in the gallery
        </span>
      </label>
      <p className="text-xs text-muted">
        {on ? 'Showing every rating.' : 'Showing General and Sensitive posts only.'}
      </p>
    </div>
  )
}
