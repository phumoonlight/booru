'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { NavProgressBar } from '@/components/nav-progress'

/**
 * The escape hatch from the numbered window: with hundreds of pages, reaching page 300
 * by arrow is not navigation, and the window only ever offers ten.
 *
 * It builds its own href instead of taking `buildHref` the way the numbers do — a
 * closure can't cross into a client component — which works because every listing that
 * paginates spells the page the same way: `?page=N` on the path it's already on, with
 * page 1 dropping the param so the canonical URL stays clean.
 */
export function PageJump({ page, pageCount }: { page: number; pageCount: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState('')
  const [pending, startTransition] = useTransition()

  function go(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) return
    // Clamped rather than rejected: someone typing past the end means "the last one".
    const target = Math.min(Math.max(parsed, 1), pageCount)
    if (target === page) return

    const params = new URLSearchParams(searchParams)
    if (target > 1) params.set('page', String(target))
    else params.delete('page')
    const qs = params.toString()

    setValue('')
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <form onSubmit={go} className="flex items-center gap-2">
      <label htmlFor="page-jump" className="sr-only">
        Go to page
      </label>
      <input
        id="page-jump"
        type="number"
        inputMode="numeric"
        min={1}
        max={pageCount}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`1–${pageCount}`}
        aria-label={`Go to page, 1 to ${pageCount}`}
        className="min-h-11 w-24 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
      />
      <button
        type="submit"
        title="Go to page"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm transition-colors hover:border-accent"
      >
        Go
      </button>
      {pending && <NavProgressBar />}
    </form>
  )
}
