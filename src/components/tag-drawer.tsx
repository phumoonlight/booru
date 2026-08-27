'use client'

import { useState, type ReactNode } from 'react'

/**
 * Danbooru's fixed left sidebar, translated for mobile: a button that opens a bottom
 * sheet under `lg`, and a plain sidebar column from `lg` up. Content (tag facets,
 * rating breakdown) is server-rendered and passed in as children.
 */
export function TagDrawer({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop: static sidebar */}
      <aside className="hidden lg:block lg:w-56 lg:shrink-0">{children}</aside>

      {/* Mobile: trigger + bottom sheet */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-fit items-center rounded-lg border border-border px-4 text-sm lg:hidden"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <button
            type="button"
            aria-label="Close tags"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/60"
          />
          <div className="max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 pb-8">
            <div className="mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center px-3 text-sm text-muted"
              >
                Close ✕
              </button>
            </div>
            {/* Navigating away closes the sheet along with the page */}
            <div onClick={() => setOpen(false)}>{children}</div>
          </div>
        </div>
      )}
    </>
  )
}
