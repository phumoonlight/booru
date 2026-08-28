'use client'

import { useActionState, useState } from 'react'
import { updateUsername, type UsernameState } from '@/lib/actions/auth'
import { SaveIcon } from '@/components/icons'

/**
 * The one editable thing on a profile. Seeded from the server-rendered name and kept
 * in state so the field survives a failed save with what was typed still in it —
 * "that username is taken" is only actionable next to the name that was rejected.
 */
export function ChangeUsername({ username }: { username: string }) {
  const [state, formAction, pending] = useActionState<UsernameState, FormData>(
    updateUsername,
    null
  )
  const [draft, setDraft] = useState(username)

  // The server lowercases and trims before saving, so compare the same way the save does
  const unchanged = draft.trim().toLowerCase() === username.toLowerCase()

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        Username
        <input
          name="username"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          required
          minLength={3}
          maxLength={32}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
        />
      </label>
      <p className="text-xs text-muted">
        3–32 characters: letters, numbers, and <code>_ . -</code>. Uppercase is folded down.
      </p>

      {state?.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
          {state.error}
        </p>
      )}
      {state?.username && !pending && (
        <p className="text-sm text-muted">Saved — you are now {state.username}.</p>
      )}

      <button
        type="submit"
        disabled={pending || unchanged}
        className="flex min-h-11 w-fit items-center gap-2 rounded-lg bg-accent px-4 font-medium text-background disabled:opacity-50"
      >
        <SaveIcon />
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
