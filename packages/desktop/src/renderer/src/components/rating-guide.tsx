import { useEffect } from 'react'
import { RATING_COLOR, RATING_LABEL, RATING_NAME, RATINGS, isRestricted } from '@common/search'

/**
 * What the two ratings mean, and what choosing one actually does.
 *
 * It used to explain four, and most of what it had to explain was the scale rather than
 * the picture: the line between Sensitive and Questionable is a judgement nobody makes
 * the same way twice from the words alone, and the board did nothing with either answer
 * except decide whether the post was behind the setting. Two tiers ask the only question
 * that had a consequence, so this is short now — but it is still worth a panel, because
 * the consequence is off this screen and invisible from the picker.
 *
 * Written from what the code actually does: `RESTRICTED_RATINGS` is what gates the site,
 * and the wording below follows it. How sexual a post is, in any finer degree than this,
 * is what its tags are for.
 */
const MEANING: Record<string, { short: string; examples: string }> = {
  g: {
    short: 'Safe to have on screen anywhere.',
    examples: 'Portraits, scenery, ordinary clothes, swimwear — anything mild enough to pass.',
  },
  r: {
    short: 'Adult. Hidden until a visitor turns the setting on.',
    examples: 'Nudity, sex, or anything strongly sexual enough that you would not want it found.',
  },
}

export function RatingGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // The backdrop closes it, the panel inside does not — a click meant for the text
    // should not dismiss the thing you were reading.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About rating"
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="mx-auto flex w-full max-w-2xl flex-col gap-4"
      >
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-bold tracking-tight">About rating</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto min-h-9 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-surface"
          >
            Close
          </button>
        </div>

        <p className="text-sm text-muted">
          Every post carries one of these. It is the one field on a card that is not about what is
          in the picture but about who should see it — the board hides R-18 from anyone who has not
          asked for it.
        </p>

        <ul className="flex flex-col gap-2">
          {RATINGS.map((rating) => (
            <li
              key={rating}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3"
            >
              <p className="flex flex-wrap items-baseline gap-2">
                <span className={`text-sm font-semibold ${RATING_COLOR[rating]}`}>
                  {RATING_LABEL[rating]}
                </span>
                <span className="font-mono text-xs text-muted">rating:{RATING_NAME[rating]}</span>
                {isRestricted(rating) && (
                  <span className="rounded bg-background px-2 py-0.5 text-[11px] text-muted">
                    hidden by default on the board
                  </span>
                )}
              </p>
              <p className="text-sm">{MEANING[rating].short}</p>
              <p className="text-xs text-muted">{MEANING[rating].examples}</p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <h3 className="text-sm font-semibold">What the choice does</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted">
            <li>
              <span className="text-foreground">R-18 is off by default.</span> The website leaves
              it out of every listing until a visitor turns Enable NSFW on in its Settings, keeps it
              out of <span className="font-mono text-xs">sitemap.xml</span>, and asks search engines
              not to index it. A post&rsquo;s own page shows a notice instead of the picture, its
              title and preview included — so a link pasted somewhere does not describe what it is.
            </li>
            <li>
              <span className="text-foreground">It is not a lock.</span> The setting is a checkbox
              anyone can tick and there are no accounts, so this is about not showing someone
              something they did not ask for — not about keeping anyone out.
            </li>
            <li>
              <span className="text-foreground">A tag rule can raise it, never lower it.</span> A
              rule on the Tag rules screen may ask for a floor, and a card says which rule did it.
              Rating something higher by hand always sticks.
            </li>
            <li>
              <span className="text-foreground">When in doubt, go up one.</span> A post rated too
              low is on a page somebody did not want it on; a post rated too high is one search
              away, and can be corrected from Browse in two clicks whenever you notice.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
