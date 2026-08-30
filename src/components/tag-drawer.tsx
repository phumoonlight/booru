'use client'

import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Danbooru's fixed left sidebar, translated for mobile: a button that opens a bottom
 * sheet under `lg`, and a plain sidebar column from `lg` up. Content (tag facets,
 * rating breakdown) is server-rendered and passed in as children.
 */
export function TagDrawer({ children, label }: { children: ReactNode; label: string }) {
  // The sheet closes when the search it started actually lands, not on the tap that
  // starts it: closing on the tap unmounted the link mid-navigation, which took its
  // pending indicator with it and left the old results sitting there looking untouched.
  // So "open" is the query the sheet was opened over — the moment the URL differs from
  // it, the sheet is closed, and its dismissal is itself the sign the page is new.
  const params = useSearchParams().toString()
  const [openedOver, setOpenedOver] = useState<string | null>(null)
  const open = openedOver === params
  const setOpen = (next: boolean) => setOpenedOver(next ? params : null)

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
            {children}
          </div>
        </div>
      )}
    </>
  )
}
