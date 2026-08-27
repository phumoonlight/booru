import Link from 'next/link'

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-3 text-sm text-muted">
      <p>
        To add images, drop them anywhere on the{' '}
        <Link href="/" className="text-accent hover:underline">
          posts page
        </Link>{' '}
        (or use its Upload button). Every upload starts tagged{' '}
        <span className="font-mono">tagme</span>.
      </p>
      <p>Editing and deleting live in the Manage section of each post page.</p>
    </div>
  )
}
