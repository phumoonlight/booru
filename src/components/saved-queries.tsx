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

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-1">
        <Link
          href={searchHref(entry.query)}
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded px-1 text-sm hover:text-accent"
        >
          {/* 🔖 for a query that resumes somewhere, 🔍 for one that always starts at the
              newest — the same list holds both, and they behave differently enough to
              deserve telling apart at a glance. */}
          <span className="truncate">
            {start === null ? '🔍' : '🔖'} {tags ? tagLabel(tags) : 'All posts'}
          </span>
          <span className="text-xs text-muted">
            {start === null ? ago(entry.at) : `from #${start} · ${ago(entry.at)}`}
          </span>
          <NavProgress />
        </Link>
        <button
          type="button"
          onClick={() => setConfirming((open) => !open)}
          aria-expanded={confirming}
          title="Remove"
          aria-label={`Remove saved query ${entry.query}`}
          className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-sm hover:text-foreground ${
            confirming ? 'text-red-400' : 'text-muted'
          }`}
        >
          ✕
        </button>
      </div>

      {confirming && (
        <div className="mb-1 flex flex-col gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2">
          <p className="text-xs">Remove this saved query?</p>
          <div className="flex gap-2">
            {/* Cancel first, and it is the wider habit: the button under the thumb after
                a mis-tap should be the one that changes nothing. */}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => removeQuery(entry.query)}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-red-500 text-sm font-medium text-background"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * The sidebar's shelf of saved queries, and the two controls that put things on it.
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

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Saved</h2>
        <div className="flex items-center gap-1">
          {drifted && (
            <button
              type="button"
              onClick={() => updateQuery(current)}
              title={`Update "${withoutStart(match.query) || 'All posts'}" to start here`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-sm hover:border-accent"
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
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-lg hover:border-accent"
            >
              <span aria-hidden>➕</span>
              <span className="sr-only">Save this search</span>
            </button>
          )}
        </div>
      </div>

      {saved.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing saved. ➕ keeps the current search; 🔖 on a thumbnail starts the listing
          there, and saving that keeps your place too.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {saved.map((entry) => (
            <Row key={entry.query} entry={entry} />
          ))}
        </ul>
      )}
    </>
  )
}
