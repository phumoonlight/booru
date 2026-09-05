'use client'

import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * The tag and rating facets, behind a button, at every width.
 *
 * It was Danbooru's fixed left sidebar under `lg` and a bottom sheet above it. The
 * sidebar cost every row of thumbnails a 224px column, permanently, to hold facets that
 * are used in bursts — you narrow a search, then look at pictures for a while. Now the
 * grid has the full width and the facets are one tap away at any size.
 *
 * Content is server-rendered and passed in as children.
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-fine:min-h-8 flex min-h-11 w-fit shrink-0 items-center rounded-lg border border-border px-3 text-sm hover:border-accent"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Close tags"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/60"
          />
          {/* Capped and centred, so the sheet is a panel on a wide screen rather than a
              band of controls stretched across two thousand pixels. */}
          <div className="mx-auto max-h-[70vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 pb-8">
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
