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

/**
 * Bare emoji — no chrome, since the glyph already reads as a button. Height is mirrored
 * by the post page's loading skeleton, so keep the two in step.
 */
const BUTTON = 'flex items-center justify-center text-lg hover:opacity-80'

/**
 * Prev/next arrows, plus ←/→ as keyboard shortcuts. They ride the sidebar's header row
 * beside the wordmark, so the image column is left entirely to the image.
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

  if (!prevId && !nextId) return null

  return (
    <nav className="flex items-center gap-2">
      {prevId && (
        <Link
          href={`/posts/${prevId}`}
          title="Newer post (←)"
          aria-label="Newer post"
          className={BUTTON}
        >
          <span aria-hidden>⬅️</span>
        </Link>
      )}
      {nextId && (
        <Link
          href={`/posts/${nextId}`}
          title="Older post (→)"
          aria-label="Older post"
          className={BUTTON}
        >
          <span aria-hidden>➡️</span>
        </Link>
      )}
    </nav>
  )
}
