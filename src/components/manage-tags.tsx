'use client'

import { startTransition, useActionState, useState, useTransition } from 'react'
import {
  createTag,
  deleteTag,
  renameTag,
  updateTagCategory,
  type CreateTagState,
  type DeleteTagState,
  type RenameTagState,
  type TagCategoryState,
} from '@/lib/actions/tags'
import { parseTagInput, TAG_CATEGORIES, type Tag, type TagCategory } from '@/lib/tags'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/components/tag-list'
import { PencilIcon, TrashIcon } from '@/components/icons'
import { tagLabel } from '@/lib/search'

const FIELD =
  'min-h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-accent disabled:opacity-50'

/**
 * Underscores are what a tag uses for the spaces in a name, so the space bar types one.
 * The alternative is a field that silently rejects the most natural keystroke in
 * `blue hair`, or accepts it and hands back an error about a second tag the typist never
 * meant to start. Done on the way in rather than on save so the field always shows the
 * name that will actually be stored.
 */
function asTagName(typed: string): string {
  return typed.replace(/\s/g, '_')
}

/**
 * Name a tag before any post carries it — the other order from an upload, which creates
 * its tags as a side effect of applying them. Handy for an artist or a series you want
 * spelled and categorized correctly the first time it is used.
 *
 * The action is called inside a transition rather than through `useActionState`, because
 * what should happen on success is *clearing the field*, and a hook that only hands back
 * a state would need a setState-in-effect to do it — which the React Compiler forbids.
 * A failed create keeps what was typed: "already exists" is only actionable next to the
 * name it rejected.
 */
function NewTag({ tags }: { tags: Tag[] }) {
  const [pending, startCreate] = useTransition()
  const [state, setState] = useState<CreateTagState>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TagCategory>('general')

  // Normalized the way the action normalizes it, so the duplicate check below compares
  // what would actually be inserted rather than what was typed
  const [normalized] = parseTagInput(name).tags
  const exists = normalized !== undefined && tags.some((tag) => tag.name === normalized)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData()
        data.set('name', name)
        data.set('category', category)
        startCreate(async () => {
          const result = await createTag(null, data)
          setState(result)
          if (result?.ok) setName('')
        })
      }}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(asTagName(event.target.value))}
          placeholder="new_tag_name"
          aria-label="New tag name"
          maxLength={64}
          autoCapitalize="none"
          spellCheck={false}
          className={`min-w-40 flex-1 ${FIELD} ${normalized ? CATEGORY_COLOR[category] : ''}`}
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as TagCategory)}
          aria-label="Category of the new tag"
          className={FIELD}
        >
          {TAG_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {CATEGORY_LABEL[option]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || !normalized || exists}
          className="flex min-h-9 items-center gap-1.5 px-1 text-sm text-accent hover:underline disabled:opacity-50 disabled:no-underline"
        >
          <span aria-hidden>➕</span>
          {pending ? 'Creating…' : 'Create'}
        </button>
      </div>

      {/* The list is already in hand, so a name that is taken says so as it is typed
          rather than after a round trip */}
      {exists ? (
        <p className="text-xs text-muted">{tagLabel(normalized)} already exists.</p>
      ) : state?.error ? (
        <p className="text-xs text-red-400">{state.error}</p>
      ) : state?.ok ? (
        <p className="text-xs text-muted">Created {tagLabel(state.name)}.</p>
      ) : null}
    </form>
  )
}

/**
 * One row = one tag with its category picker, a rename button and a delete button.
 * Picking a category submits straight away — that control has a single value, so a
 * separate Save button would only add a step. The name keeps the colour of the category
 * currently selected, so the change is visible before the page revalidates.
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
  // Held locally for the same reason the category is: the row shows the new name the
  // moment it saves, without waiting for the revalidation to bring the prop back
  const [name, setName] = useState(tag.name)
  // Deleting takes the tag off every post it is on, with no undo, so the trash icon
  // only arms the confirmation — the second tap is the destructive one.
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tag.name)
  const [renaming, startRename] = useTransition()
  const [rename, setRename] = useState<RenameTagState>(null)
  const label = tagLabel(name)

  // The row survives the revalidation that follows a successful delete only until the
  // page re-renders without it; until then, dim it so it reads as gone.
  const gone = removal?.ok
  const busy = pending || removing || renaming || gone

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
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value as Tag['category']
              setCategory(next)
              const data = new FormData()
              data.set('id', String(tag.id))
              data.set('category', next)
              startTransition(() => formAction(data))
            }}
            aria-label={`Category of ${label}`}
            className={FIELD}
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
          onClick={() => {
            setDraft(name)
            setRename(null)
            setEditing((open) => !open)
          }}
          disabled={busy}
          title={`Rename ${label}`}
          aria-label={`Rename ${label}`}
          aria-expanded={editing}
          className={`flex min-h-9 w-9 shrink-0 items-center justify-center rounded-lg border hover:bg-surface disabled:opacity-50 ${
            editing ? 'border-accent text-accent' : 'border-border text-muted'
          }`}
        >
          <PencilIcon />
        </button>

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

      {/* Renaming moves no post links — the tag keeps its id — so unlike the delete
          below it needs no confirmation, only somewhere to type. The panel closes itself
          on success, which is why this action too is called in a transition rather than
          held in a `useActionState`. */}
      {editing && !gone && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData()
            data.set('id', String(tag.id))
            data.set('name', draft)
            startRename(async () => {
              const result = await renameTag(null, data)
              setRename(result)
              if (result?.ok) {
                setName(result.name)
                setEditing(false)
              }
            })
          }}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2 text-sm"
        >
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(asTagName(event.target.value))}
              aria-label={`New name for ${label}`}
              maxLength={64}
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className={`min-w-0 flex-1 ${FIELD}`}
            />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-9 shrink-0 px-1 text-sm text-muted hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={renaming || !draft.trim() || draft.trim() === name}
              className="flex min-h-9 shrink-0 items-center gap-1.5 px-1 text-sm text-accent hover:underline disabled:opacity-50 disabled:no-underline"
            >
              <span aria-hidden>💾</span>
              {renaming ? 'Saving…' : 'Save'}
            </button>
          </div>
          {rename?.error && <p className="text-xs text-red-400">{rename.error}</p>}
          {tag.post_count > 0 && (
            <p className="text-xs text-muted">
              Renames on {tag.post_count} post{tag.post_count === 1 ? '' : 's'}. Searches for the
              old name stop matching; links to this tag&apos;s page keep working.
            </p>
          )}
        </form>
      )}

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

/**
 * New-tag form, filter box, then the rows. The list is long enough that scrolling to a
 * tag is the slow part.
 */
export function ManageTags({ tags }: { tags: Tag[] }) {
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const shown = needle ? tags.filter((tag) => tag.name.includes(needle)) : tags

  return (
    <div className="flex flex-col gap-3">
      <NewTag tags={tags} />

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
