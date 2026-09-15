import Image from 'next/image'
import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'

/**
 * What a restricted collection, or an image on one, shows when the visitor has not turned
 * the adult tiers on.
 *
 * The lists leave those shelves out, but a page's own URL is reachable without them — and a
 * link is exactly how someone arrives at one without having gone past the list. So the check belongs on the page too, not only on the query that
 * would have offered it.
 *
 * It says nothing about the post — not the tier, not even the number. A gate that
 * describes what is behind it is not much of a gate, and the cat is doing the work
 * anyway. There is no link to Settings either: the header has one on every page, and a
 * gate that offers its own key in the same breath is a formality.
 */
export function RestrictedNotice() {
  return (
    // Centred against the viewport, not just the column: `main` is a flex child with
    // `pb-8`, so the height to fill is the viewport less that padding — anything taller
    // and the page grows a scrollbar for nothing.
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center justify-center gap-8 px-3 py-8 text-center">
      <Image
        src="/nsfw-gate.jpg"
        alt=""
        width={473}
        height={456}
        priority
        className="h-auto w-[320px] max-w-full rounded-lg"
      />

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold tracking-tight">&ldquo;What are you doing?&rdquo;</h1>
        <p className="text-sm text-muted">You might not want to see this.</p>
      </div>

      <Link href="/posts" className="text-sm text-muted hover:text-foreground hover:underline">
        Back to the latest
        <NavProgress />
      </Link>
    </div>
  )
}
