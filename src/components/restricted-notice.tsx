import Image from 'next/image'
import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { RATING_COLOR, RATING_LABEL, type Rating } from '@common/search'

/**
 * What a post page shows when the visitor has not turned the adult tiers on.
 *
 * The listing has left those posts out since the setting arrived, but a post's own URL
 * never checked — and a link is exactly how someone arrives at one without having gone
 * past the gallery. So the check belongs on the page too, not only on the query that
 * would have offered it.
 *
 * It names the tier, so the refusal doesn't read as a broken link, and otherwise gets out
 * of the way with a joke — the cat is doing the work. There is no link to Settings: the
 * gallery has one in its header, and a gate that offers its own key in the same breath is
 * a formality rather than a gate.
 *
 * Everything about the post itself stays off this page: no thumbnail, no tags, no
 * dimensions. A gate that describes what is behind it is not much of a gate either.
 */
export function RestrictedNotice({ postId, rating }: { postId: number; rating: Rating }) {
  return (
    // Centred against the viewport, not just the column: `main` is a flex child with
    // `pb-8`, so the height to fill is the viewport less that padding — anything taller
    // and the page grows a scrollbar for nothing.
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center justify-center gap-5 px-3 py-8 text-center">
      <Image
        src="/nsfw-gate.jpg"
        alt=""
        width={473}
        height={456}
        priority
        className="h-auto w-56 max-w-full rounded-lg"
      />

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold tracking-tight">&ldquo;What are you doing?&rdquo;</h1>
        <p className="text-sm text-muted">
          Post #{postId} is rated{' '}
          <span className={RATING_COLOR[rating]}>{RATING_LABEL[rating]}</span>, and this
          browser is set to leave those out.
        </p>
      </div>

      <Link href="/posts" className="text-sm text-muted hover:text-foreground hover:underline">
        Back to the gallery
        <NavProgress />
      </Link>
    </div>
  )
}
