import Link from 'next/link'

export default function PostNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-5xl font-bold tracking-tight text-muted">404</p>
      <h1 className="text-lg font-semibold">No such post</h1>
      <p className="text-sm text-muted">
        This post was deleted, or the id doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm text-background"
      >
        Browse posts
      </Link>
    </div>
  )
}
