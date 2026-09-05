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
 * It says which tier it is and where the switch lives, because a blank refusal reads as
 * a broken link and sends people looking for the post somewhere else. Everything about
 * the post itself stays off this page: no thumbnail, no tags, no dimensions. A gate that
 * describes what is behind it is not much of a gate.
 */
export function RestrictedNotice({ postId, rating }: { postId: number; rating: Rating }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-3 py-16 text-center">
      <Image
        src="/nsfw-gate.jpg"
        alt=""
        width={473}
        height={456}
        priority
        className="h-auto w-56 max-w-full rounded-lg"
      />

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold tracking-tight">Not without asking first</h1>
        <p className="text-sm text-muted">
          Post #{postId} is rated{' '}
          <span className={RATING_COLOR[rating]}>{RATING_LABEL[rating]}</span>, and this
          browser is set to leave those out.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <Link href="/settings" className="text-accent hover:underline">
          Enable NSFW in Settings
          <NavProgress />
        </Link>
        <Link href="/posts" className="text-muted hover:text-foreground hover:underline">
          Back to the gallery
          <NavProgress />
        </Link>
      </div>
    </div>
  )
}
