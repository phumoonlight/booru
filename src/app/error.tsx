'use client'

import Link from 'next/link'

/**
 * Route-level error boundary. Server-side errors arrive here with a generic message
 * and a `digest` that matches the server log, so that's what we surface.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        This page couldn&apos;t be loaded. It is usually the database connection — trying again
        often works.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted">
          Reference: <span className="select-all">{error.digest}</span>
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm text-background"
        >
          Try again
        </button>
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-lg border border-border px-4 text-sm"
        >
          Back to posts
        </Link>
      </div>
    </div>
  )
}
