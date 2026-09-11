import Link from 'next/link'
import { BOARD } from '@common/board'

/**
 * The gallery's 404, pointed at the other board. Its own file rather than a shared one,
 * because a `not-found.tsx` is a route's boundary and cannot be handed a prop — and the
 * one thing it has to get right is sending you back to the listing you came from.
 */
export default function AiPostNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-5xl font-bold tracking-tight text-muted">404</p>
      <h1 className="text-lg font-semibold">No such post</h1>
      <p className="text-sm text-muted">This post was deleted, or the id doesn&apos;t exist.</p>
      <Link
        href={BOARD.generative.path}
        className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm text-background"
      >
        Browse {BOARD.generative.label}
      </Link>
    </div>
  )
}
