import { useEffect } from 'react'
import { RATING_COLOR, RATING_LABEL, RATING_NAME, RATINGS, isRestricted } from '@common/search'

/**
 * What the four ratings mean, and what choosing one actually does.
 *
 * The select on a queue card offers four words and no help, and the difference between
 * Sensitive and Questionable is a judgement nobody makes the same way twice from the
 * words alone. Worse, the choice has consequences off this screen — two of the tiers
 * decide whether the post is in the listing at all for someone who has not turned the
 * adult ones on — and none of that is visible from the card.
 *
 * Written from what the code actually does, not from what a booru usually does:
 * `RESTRICTED_RATINGS` is what gates the site, and the wording below follows it. The
 * examples are Danbooru's, since the scale is Danbooru's.
 */
const MEANING: Record<string, { short: string; examples: string }> = {
  g: {
    short: 'Nothing suggestive. Safe to have on screen anywhere.',
    examples: 'Portraits, scenery, ordinary clothes, anything you would show a stranger.',
  },
  s: {
    short: 'Mildly suggestive, but nothing is exposed.',
    examples: 'Swimwear, underwear worn as clothing, cleavage, a suggestive pose fully dressed.',
  },
  q: {
    short: 'Strongly suggestive, or partly undressed.',
    examples: 'Bare breasts, see-through or open clothing, a pose whose subject is the sex of it.',
  },
  e: {
    short: 'Nudity or sex.',
    examples: 'Genitals, sexual acts, fluids — anything with nothing left implied.',
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
          Every post carries exactly one of these. It is the one field on a card that is not about
          what is in the picture but about who should see it — the board hides two of the four from
          anyone who has not asked for them.
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
              <span className="text-foreground">Questionable and Explicit are off by default.</span>{' '}
              The website leaves them out of every listing until a visitor turns Enable NSFW on in
              its Settings, keeps them out of <span className="font-mono text-xs">sitemap.xml</span>
              , and asks search engines not to index them. A post&rsquo;s own page shows a notice
              instead of the picture, its title and preview included — so a link pasted somewhere
              does not describe what it is.
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
