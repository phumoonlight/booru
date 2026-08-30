'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { login, type AuthFormState } from '@/lib/actions/auth'
import { SITE_NAME } from '@/lib/site'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(login, null)

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-sm flex-col justify-center gap-6 px-4">
      {/* This page has no SearchHeader, so it carries its own way back */}
      <Link href="/posts" className="text-center text-5xl font-bold tracking-tight">
        {SITE_NAME}
      </Link>
      <h1 className="text-center text-2xl font-bold tracking-tight">Log in</h1>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        {state?.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-accent font-medium text-background disabled:opacity-50"
        >
          {pending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
