'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import { NavProgress, NavProgressBar } from '@/components/nav-progress'
import { postHref } from '@common/search'

/**
 * True while the visitor is typing — the tag field and search bar own the arrow
 * keys there (↑↓ picks a suggestion, ←→ moves the caret).
 */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/**
 * True while something is open over the page — the picture at full size, today. A modal
 * dialog makes the rest of the document inert, but a `keydown` listener on `window` is
 * not part of the document it made inert: the arrows still fired, so pressing → while
 * looking at the post closed nothing and quietly loaded the next one behind it.
 *
 * Asked of the DOM rather than passed in, because what the arrows have to yield to is
 * "a modal is open" and not "this particular component says so" — the next one gets the
 * same answer for free.
 */
function isModalOpen() {
  return document.querySelector('dialog[open]') !== null
}

/**
 * Bare emoji — no chrome, since the glyph already reads as a button. Height is mirrored
 * by the post page's loading skeleton, so keep the two in step.
 */
const BUTTON = 'flex items-center justify-center text-lg hover:opacity-80'

/**
 * Prev/next arrows, plus ←/→ as keyboard shortcuts. They ride the page's header row
 * beside the wordmark, and yield the keys to a box being typed in or a modal being
 * looked through.
 * `<Link>` keeps them prefetched and crawlable; the shortcut only mirrors them.
 *
 * `query` is the search these two ids were found in. The ids already come from it — the
 * page asks `searchNeighbours` — and carrying it in the href is what keeps the *next*
 * step inside the same search: without it, one arrow press leaves the listing behind
 * and the walk quietly becomes the whole board's.
 */
export function PostNav({
  prevId,
  nextId,
  query = '',
}: {
  prevId: number | null
  nextId: number | null
  query?: string
}) {
  const router = useRouter()
  // The post page has no `loading.tsx` any more — the router holds the post on screen
  // until the next one has arrived, which is what stopped the walk from blinking and
  // also what makes a slow answer look like a press that did nothing. The bar is what
  // says otherwise. A click gets it from `NavProgress` inside the link; a keypress has
  // no link to sit in, so the push is a transition and this watches that instead.
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (isTyping(event.target) || isModalOpen()) return

      const id = event.key === 'ArrowLeft' ? prevId : event.key === 'ArrowRight' ? nextId : null
      if (id === null) return

      event.preventDefault()
      startTransition(() => router.push(postHref(id, query)))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [prevId, nextId, query, router])

  if (!prevId && !nextId) return null

  return (
    <nav className="flex items-center gap-2">
      {pending && <NavProgressBar />}
      {prevId && (
        <Link
          href={postHref(prevId, query)}
          title="Newer post (←)"
          aria-label="Newer post"
          // Both neighbours, in full. A post page is dynamic — it reads the NSFW cookie —
          // so the default prefetch fetches nothing of it, and the walk is the one
          // navigation on this site whose next two destinations are known before it is
          // taken. Warming them is what turns holding the old page into a swap.
          prefetch
          className={BUTTON}
        >
          <span aria-hidden>⬅️</span>
          <NavProgress />
        </Link>
      )}
      {nextId && (
        <Link
          href={postHref(nextId, query)}
          title="Older post (→)"
          aria-label="Older post"
          prefetch
          className={BUTTON}
        >
          <span aria-hidden>➡️</span>
          <NavProgress />
        </Link>
      )}
    </nav>
  )
}
