'use client'

import { startTransition, useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { deletePost, updatePost, type EditPostState } from '@/lib/actions/posts'
import { TagField, type TagSeed } from '@/components/tag-field'
import { RATING_LABEL, RATINGS } from '@common/search'

/**
 * Admin controls inlined on the post page — editing happens where the post is,
 * so there's no separate manage screen.
 */
export function ManagePost({
  postId,
  initialTags,
  initialRating,
  initialSourceUrl,
}: {
  postId: number
  initialTags: TagSeed[]
  initialRating: string
  initialSourceUrl: string
}) {
  const [state, formAction, pending] = useActionState<EditPostState, FormData>(updatePost, null)
  // Deleting drops the row, its tags and both storage files with no undo, so the
  // trash icon only arms the confirmation — the second tap is the destructive one.
  const [confirming, setConfirming] = useState(false)

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h2 className="text-sm font-semibold">Manage</h2>

      {/*
        onSubmit, not <form action>: React resets a form as soon as its action runs, which
        would snap the rating and source boxes back to the values they held on mount right
        after a save that in fact stored the new ones.
      */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          startTransition(() => formAction(data))
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="id" value={postId} />

        <TagField name="tags" initialTags={initialTags} />

        <label className="flex flex-col gap-1.5 text-sm">
          Rating
          <select
            name="rating"
            defaultValue={initialRating}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          >
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {RATING_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Source URL (optional)
          {/*
            A textarea, not an `input type="url"`: the panel is a ~220px sidebar column and a
            single-line box scrolls a source link out of sight just when you want to check it.
            Wrapping shows the whole URL at once; the server still validates it as a URL and
            trims the newline a paste can leave behind.
          */}
          <textarea
            name="source_url"
            rows={2}
            defaultValue={initialSourceUrl}
            placeholder="https://…"
            className="resize-y break-all rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
          />
        </label>

        {/* Plain labelled actions rather than filled buttons — the panel is a narrow
            sidebar column, and two solid blocks outweighed the fields above them */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="flex min-h-11 items-center gap-1.5 text-sm text-accent hover:underline disabled:opacity-50 disabled:no-underline"
          >
            <span aria-hidden>💾</span>
            Save
          </button>
          {/* Armed reads as underlined, the state the border used to carry */}
          <button
            type="button"
            onClick={() => setConfirming((armed) => !armed)}
            aria-expanded={confirming}
            className={`flex min-h-11 items-center gap-1.5 text-sm text-red-400 hover:underline ${
              confirming ? 'underline' : ''
            }`}
          >
            <span aria-hidden>🗑️</span>
            Delete
          </button>
        </div>

        {/* Under the buttons, not above the fields: the outcome belongs where the tap
            that caused it was, and the panel is tall enough that the top scrolls away */}
        {state?.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg border border-green-500/30 bg-green-500/15 px-3 py-2 text-sm text-green-400">
            Saved
          </p>
        )}
      </form>

      {/* Its own form, outside the edit form — Save must never carry a delete intent */}
      {confirming && (
        <form
          action={deletePost}
          className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3"
        >
          <input type="hidden" name="id" value={postId} />
          <p className="text-sm">
            Delete post #{postId}? Its tags and both image files go too. This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border text-sm"
            >
              Cancel
            </button>
            <DeleteButton />
          </div>
        </form>
      )}
    </section>
  )
}

/** Own component so useFormStatus can read the delete form it sits in. */
function DeleteButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-red-500 text-sm font-medium text-background disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
