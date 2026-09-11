'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  GENERATIVE_COOKIE,
  GENERATIVE_COOKIE_MAX_AGE,
  GENERATIVE_COOKIE_VALUE,
} from '@/lib/generative'
import { BOARD } from '@common/board'

/**
 * The switch that puts 🤖 AI posts in the nav.
 *
 * **A plain checkbox, deliberately.** The setting beside it is a pot on the boil, because
 * what that one changes is what a picture on this site *is* and a sentence was doing a
 * worse job of saying it than a picture could. This one changes whether a second gallery
 * is offered, which is a fact and not a mood — there is nothing here a drawing would say
 * that the words do not. If it earns a scene later it can have one; drawing one now would
 * be a flourish spent on the wrong setting.
 *
 * `router.refresh()` after the write for the reason the pot does it: the nav is server
 * rendered from this cookie, so nothing on screen moves until the server renders again.
 */
export function GenerativeToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)

  const set = (next: boolean) => {
    setOn(next)
    document.cookie = next
      ? `${GENERATIVE_COOKIE}=${GENERATIVE_COOKIE_VALUE}; path=/; max-age=${GENERATIVE_COOKIE_MAX_AGE}; samesite=lax`
      : `${GENERATIVE_COOKIE}=; path=/; max-age=0; samesite=lax`
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => set(event.target.checked)}
          className="size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-sm font-semibold">
          <span aria-hidden="true">🤖</span> Show {BOARD.generative.label}
        </span>
      </label>

      {/* What it does, said once. The nav item is the whole visible change, and the line
          that matters is the one about the boards being separate — a reader who turns
          this on and finds none of their tags there should have been told why first. */}
      <p className="text-xs leading-relaxed text-muted">
        Puts <span className="font-semibold">{BOARD.generative.label}</span> in the nav — a second
        gallery, of generated images, with its own posts and its own counts. The tags are the same
        tags; the pictures are not the same pictures. Off by default, and{' '}
        <span className="font-semibold">{BOARD.generative.path}</span> is reachable either way.
      </p>
    </div>
  )
}
