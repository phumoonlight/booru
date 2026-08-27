'use client'

import { useState, type ReactNode } from 'react'

/**
 * Anonymous visitors reach a restricted post only by direct link — the gallery and
 * sitemap already filter it out — so the detail page blurs the image behind one tap
 * instead of hiding it. Signed-in viewers never see this wrapper.
 */
export function ExplicitGate({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)

  if (revealed) return <>{children}</>

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none blur-2xl saturate-50">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 p-4 text-center">
        <p className="text-sm font-semibold">Explicit content</p>
        <p className="max-w-xs text-xs text-muted">
          This post is rated E3 or higher and is hidden by default.
        </p>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm text-background"
        >
          Show image
        </button>
      </div>
    </div>
  )
}
