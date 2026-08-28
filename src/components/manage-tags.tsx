'use client'

import { startTransition, useActionState, useState } from 'react'
import {
  deleteTag,
  updateTagCategory,
  type DeleteTagState,
  type TagCategoryState,
} from '@/lib/actions/tags'
import { TAG_CATEGORIES, type Tag } from '@/lib/tags'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/components/tag-list'
import { TrashIcon } from '@/components/icons'
import { tagLabel } from '@/lib/search'

/**
 * One row = one tag with its category picker and a delete button. Picking a category
 * submits straight away — a row has a single field, so a separate Save button would
 * only add a step. The name keeps the colour of the category currently selected, so
 * the change is visible before the page revalidates.
 */
function TagRow({ tag }: { tag: Tag }) {
  const [state, formAction, pending] = useActionState<TagCategoryState, FormData>(
    updateTagCategory,
    null
  )
  const [removal, removeAction, removing] = useActionState<DeleteTagState, FormData>(
    deleteTag,
    null
  )
  const [category, setCategory] = useState(tag.category)
  // Deleting takes the tag off every post it is on, with no undo, so the trash icon
  // only arms the confirmation — the second tap is the destructive one.
  const [confirming, setConfirming] = useState(false)
  const label = tagLabel(tag.name)

  // The row survives the revalidation that follows a successful delete only until the
  // page re-renders without it; until then, dim it so it reads as gone.
  const gone = removal?.ok

  return (
    <li
      className={`flex flex-col gap-1 border-b border-border/60 py-1 last:border-b-0 ${
        gone ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {/*
          Dispatched by hand rather than through a <form action>: React resets a form once
          its action runs, and a native reset drops the <select> back to its first option
          (Artist) while React state still holds the pick — so the row would misreport a
          category that in fact saved correctly.
        */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${CATEGORY_COLOR[category]}`}>
            {label}
          </span>
          <span className="text-xs tabular-nums text-muted">{tag.post_count}</span>
          <select
            name="category"
            value={category}
            disabled={pending || removing || gone}
            onChange={(event) => {
              const next = event.target.value as Tag['category']
              setCategory(next)
              const data = new FormData()
              data.set('id', String(tag.id))
              data.set('category', next)
              startTransition(() => formAction(data))
            }}
            aria-label={`Category of ${label}`}
            className="min-h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          >
            {TAG_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {CATEGORY_LABEL[option]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setConfirming((armed) => !armed)}
          disabled={removing || gone}
          title={`Delete ${label}`}
          aria-label={`Delete ${label}`}
          aria-expanded={confirming}
          className={`flex min-h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-red-400 hover:bg-red-500/10 disabled:opacity-50 ${
            confirming ? 'border-red-500 bg-red-500/10' : 'border-red-500/30'
          }`}
        >
          <TrashIcon />
        </button>

        <span className="w-4 shrink-0 text-xs" aria-live="polite">
          {pending ? '…' : state?.ok ? <span className="text-green-400">✓</span> : ''}
          {state?.error && (
            <span className="text-red-400" title={state.error}>
              ⚠️
            </span>
          )}
        </span>
      </div>

      {/* Its own form, outside the category form — changing a category must never
          carry a delete intent */}
      {confirming && !gone && (
        <form
          action={removeAction}
          className="flex flex-col gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-sm"
        >
          <input type="hidden" name="id" value={tag.id} />
          <p>
            Delete <span className="font-mono">{label}</span>?{' '}
            {tag.post_count > 0
              ? `It comes off ${tag.post_count} post${tag.post_count === 1 ? '' : 's'}.`
              : 'It is on no posts.'}{' '}
            This can&apos;t be undone.
          </p>
          {removal?.error && <p className="text-red-400">{removal.error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-9 flex-1 rounded-lg border border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={removing}
              className="min-h-9 flex-1 rounded-lg bg-red-500 font-medium text-background disabled:opacity-50"
            >
              {removing ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

/** Filter box + rows. The list is long enough that scrolling to a tag is the slow part. */
export function ManageTags({ tags }: { tags: Tag[] }) {
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const shown = needle ? tags.filter((tag) => tag.name.includes(needle)) : tags

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter tags…"
        aria-label="Filter tags"
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
      />

      {shown.length === 0 ? (
        <p className="text-sm text-muted">No tags match “{filter}”.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
          {shown.map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
        </ul>
      )}
    </div>
  )
}
