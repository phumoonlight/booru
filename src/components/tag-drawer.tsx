'use client'

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'

/**
 * The tag and rating facets, behind a button, at every width.
 *
 * It was Danbooru's fixed left sidebar under `lg` and a bottom sheet above it. The
 * sidebar cost every row of thumbnails a 224px column, permanently, to hold facets that
 * are used in bursts — you narrow a search, then look at pictures for a while. Now the
 * grid has the full width and the facets are one tap away at any size: the panel slides
 * over the left edge, where the sidebar used to be, so a tag is where the hand expects.
 *
 * The trigger is a 🍔 in the header, ahead of the wordmark — the corner a menu is looked
 * for in, and the panel opens against that same edge. It was a labelled button in a row
 * of its own above the grid, which spent a line of the page saying what one glyph says.
 * The count it used to carry lives in the title and the accessible name, and again on
 * the panel's own heading.
 *
 * Content is server-rendered and passed in as children.
 *
 * The open panel is **portalled to `<body>`**, and has to be. The trigger sits inside the
 * sticky header, which carries `backdrop-blur` — and a `backdrop-filter` makes an element
 * the containing block for every `position: fixed` descendant. `inset-0` then meant the
 * header's own box rather than the viewport, so the panel came out as a small pane hanging
 * under the bar instead of a column down the left edge. Nothing renders on the server
 * either way: the panel exists only once it has been opened.
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
        title={label}
        aria-label={label}
        aria-expanded={open}
        className="pointer-fine:size-8 group/menu flex size-11 shrink-0 items-center justify-center rounded-lg border border-border leading-none transition-colors hover:border-accent"
      >
        {/* A hamburger menu, taken at its word. Desaturated at rest like every other emoji
            button here — they ignore `color`, so this is what keeps it from shouting at
            the wordmark beside it — and hover hands it back its own. */}
        <span
          aria-hidden
          className="text-base brightness-150 grayscale transition-[filter] group-hover/menu:brightness-100 group-hover/menu:grayscale-0"
        >
          🍔
        </span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex">
            {/* Capped, so the panel is a column against the edge rather than a sheet
                covering the results it is meant to narrow. The facets are a list of tags:
                a tall narrow column fits far more of them on screen at once than a band
                across the bottom did, and leaves the grid visible beside it. */}
            <div className="flex h-full w-full max-w-sm flex-col overflow-y-auto border-r border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-end">
                {/* Emoji ignore `color`, so the ❌ is desaturated and brightened while
                    resting — against this surface that lands it near `--muted`, where
                    fading it with opacity would only sink it into the panel — and hover
                    hands the glyph its own red back. The same trick the facet buttons
                    use, for the same reason. */}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="group/close flex min-h-11 items-center gap-1.5 px-3 text-sm text-muted transition-colors hover:text-foreground"
                >
                  Close
                  <span
                    aria-hidden
                    className="text-xs brightness-150 grayscale transition-[filter] group-hover/close:brightness-100 group-hover/close:grayscale-0"
                  >
                    ❌
                  </span>
                </button>
              </div>
              {children}
            </div>
            <button
              type="button"
              aria-label="Close tags"
              onClick={() => setOpen(false)}
              className="flex-1 bg-black/60"
            />
          </div>,
          document.body
        )}
    </>
  )
}
