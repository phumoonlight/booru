'use client'

import { useActionState } from 'react'
import { deletePost, updatePost, type EditPostState } from '@/lib/actions/posts'
import { SaveIcon, TrashIcon } from '@/components/icons'

const RATINGS = ['general', 'sensitive', 'questionable', 'explicit'] as const

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
  initialTags: string
  initialRating: string
  initialSourceUrl: string
}) {
  const [state, formAction, pending] = useActionState<EditPostState, FormData>(updatePost, null)

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h2 className="text-sm font-semibold">Manage</h2>

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

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={postId} />

        <label className="flex flex-col gap-1.5 text-sm">
          Tags (space-separated)
          <textarea
            name="tags"
            required
            rows={3}
            defaultValue={initialTags}
            className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Rating
          <select
            name="rating"
            defaultValue={initialRating}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          >
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Source URL (optional)
          <input
            type="url"
            name="source_url"
            defaultValue={initialSourceUrl}
            placeholder="https://…"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            title="Save"
            aria-label="Save"
            className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent text-background disabled:opacity-50"
          >
            <SaveIcon />
          </button>
          {/* Same row, but its own form so Save never carries the delete intent */}
          <button
            type="submit"
            form={`delete-post-${postId}`}
            title="Delete post"
            aria-label="Delete post"
            className="flex min-h-11 w-14 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <TrashIcon />
          </button>
        </div>
      </form>

      <form id={`delete-post-${postId}`} action={deletePost} className="hidden">
        <input type="hidden" name="id" value={postId} />
      </form>
    </section>
  )
}
