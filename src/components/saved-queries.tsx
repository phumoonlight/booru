'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { findSaved, type SavedQuery } from '@/lib/saved-queries'
import { removeQuery, saveQuery, updateQuery, useSavedQueries } from '@/lib/use-saved-queries'
import { searchHref, startOf, tagLabel, withoutStart } from '@common/search'

/** Relative and coarse — a saved query is "where I was", and the hour is noise. */
function ago(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function Row({ entry }: { entry: SavedQuery }) {
  // The manage panel's confirmation, kept whole rather than shrunk into the ✕ itself.
  // Arming that button and firing it from the same pixel meant a double-tap removed the
  // row outright — so the tap that removes is a different button, in a place the first
  // tap was not, and the row it belongs to stays legible above it.
  const [confirming, setConfirming] = useState(false)
  const start = startOf(entry.query)
  const tags = withoutStart(entry.query)

  // Confirming replaces the pill rather than opening a panel under it. In a column
  // there was room to keep the row legible above its own confirmation; in a bar there
  // is not, and a panel that pushed the rest of the shelf sideways would move the very
  // buttons being aimed at.
  if (confirming) {
    return (
      <li className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 pl-2">
        <span className="text-xs">Remove?</span>
        {/* Cancel first, and it is the wider habit: the button under the thumb after a
            mis-tap should be the one that changes nothing. */}
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="pointer-fine:min-h-8 flex min-h-11 items-center rounded-lg px-2 text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => removeQuery(entry.query)}
          className="pointer-fine:min-h-8 flex min-h-11 items-center rounded-lg bg-red-500 px-2 text-xs font-medium text-background"
        >
          Remove
        </button>
      </li>
    )
  }

  return (
    <li className="flex shrink-0 items-center rounded-lg border border-border">
      <Link
        href={searchHref(entry.query)}
        title={start === null ? ago(entry.at) : `from #${start} · ${ago(entry.at)}`}
        className="pointer-fine:min-h-8 flex min-h-11 max-w-56 items-center gap-1 rounded-lg px-2 text-sm hover:text-accent"
      >
        {/* 🔖 for a query that resumes somewhere, 🔍 for one that always starts at the
            newest — the same list holds both, and they behave differently enough to
            deserve telling apart at a glance. */}
        <span aria-hidden>{start === null ? '🔍' : '🔖'}</span>
        <span className="truncate">{tags ? tagLabel(tags) : 'All posts'}</span>
        {/* The date is a title, not a line of its own: in a bar it doubled every row's
            height to say something you only want when choosing between two similar ones. */}
        <NavProgress />
      </Link>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Remove"
        aria-label={`Remove saved query ${entry.query}`}
        className="pointer-fine:min-h-8 pointer-fine:min-w-6 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg pr-2 text-xs text-muted hover:text-red-400"
      >
        ✕
      </button>
    </li>
  )
}

/**
 * The shelf of saved queries, and the two controls that put things on it. It sits above
 * the grid rather than in a sidebar, because a sidebar cost every thumbnail 224px of
 * width to hold three short lines that are read once a session.
 *
 * ➕ appears for a search that isn't on the shelf yet. 💾 replaces it once it is, and
 * only when the current query has drifted from what was saved — in practice, when you
 * marked a new spot. That is the whole difference between the two: adding is what makes
 * a row, saving is what moves the row you are standing in. Which row you are standing in
 * needs no selection state, because a saved query *is* its tags: the entry whose tags
 * match the current ones is the one you came from.
 */
export function SavedQueries({ currentQuery }: { currentQuery: string }) {
  const saved = useSavedQueries()
  const current = currentQuery.trim()
  const match = current ? findSaved(saved, current) : undefined
  const drifted = match !== undefined && match.query !== current

  // Nothing at all when the shelf is empty and there is nothing to put on it: an empty
  // row above the grid is a band of explanation for a feature you have not used, in the
  // place the images were supposed to get back.
  if (saved.length === 0 && !current) return null

  return (
    <div className="flex items-center gap-2">
      <h2 className="sr-only">Saved searches</h2>
      {drifted && (
        <button
          type="button"
          onClick={() => updateQuery(current)}
          title={`Update "${withoutStart(match.query) || 'All posts'}" to start here`}
          className="pointer-fine:min-h-8 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border text-sm hover:border-accent"
        >
          <span aria-hidden>💾</span>
          <span className="sr-only">Update the saved query</span>
        </button>
      )}
      {current && !match && (
        <button
          type="button"
          onClick={() => saveQuery(current)}
          title="Save this search"
          className="pointer-fine:min-h-8 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border text-sm hover:border-accent"
        >
          <span aria-hidden>➕</span>
          <span className="sr-only">Save this search</span>
        </button>
      )}

      {/* Scrolls rather than wraps: the shelf grows without ever pushing the grid down
          the page, which is the whole point of moving it out of the sidebar. */}
      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {saved.map((entry) => (
          <Row key={entry.query} entry={entry} />
        ))}
      </ul>
    </div>
  )
}
