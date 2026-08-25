'use client'

import { useActionState } from 'react'
import { updatePost, type EditPostState } from '@/lib/actions/posts'

const RATINGS = ['general', 'sensitive', 'questionable', 'explicit'] as const

export function EditPostForm({
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
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={postId} />

      {state?.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
          {state.error}
        </p>
      )}

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

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-accent font-medium text-background disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
