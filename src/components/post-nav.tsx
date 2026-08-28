'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * True while the visitor is typing — the tag field and search bar own the arrow
 * keys there (↑↓ picks a suggestion, ←→ moves the caret).
 */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

const BUTTON =
  'fixed top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/80 text-lg backdrop-blur hover:border-accent hover:text-accent'

/**
 * Prev/next arrows pinned to the viewport edges so they stay reachable however far
 * down a tall image the visitor has scrolled, plus ←/→ as keyboard shortcuts.
 * `<Link>` keeps them prefetched and crawlable; the shortcut only mirrors them.
 */
export function PostNav({ prevId, nextId }: { prevId: number | null; nextId: number | null }) {
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (isTyping(event.target)) return

      const id = event.key === 'ArrowLeft' ? prevId : event.key === 'ArrowRight' ? nextId : null
      if (id === null) return

      event.preventDefault()
      router.push(`/posts/${id}`)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [prevId, nextId, router])

  return (
    <>
      {prevId && (
        <Link
          href={`/posts/${prevId}`}
          title="Newer post (←)"
          aria-label="Newer post"
          className={`${BUTTON} left-1 sm:left-3`}
        >
          ←
        </Link>
      )}
      {nextId && (
        <Link
          href={`/posts/${nextId}`}
          title="Older post (→)"
          aria-label="Older post"
          className={`${BUTTON} right-1 sm:right-3`}
        >
          →
        </Link>
      )}
    </>
  )
}
