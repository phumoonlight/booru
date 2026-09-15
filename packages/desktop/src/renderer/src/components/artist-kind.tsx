import { SEGMENTS, segment } from './buttons'

/**
 * The two switches on the Artists screen, both the pair of segments every two-position
 * control in this window is — the same control over the two axes the list is cut along.
 *
 * Non-AI or AI. Used three times — which list the screen shows, what a new artist is saved
 * as, and what an existing one is — so the two labels are spelled once.
 */
export function ArtistKindSwitch({
  isAi,
  onChange,
  label,
}: {
  isAi: boolean
  onChange: (isAi: boolean) => void
  /** What the group is for, for a screen reader — the three uses mean different things. */
  label: string
}) {
  return (
    <div role="group" aria-label={label} className={SEGMENTS}>
      {[false, true].map((on) => (
        <button
          key={String(on)}
          type="button"
          onClick={() => onChange(on)}
          aria-pressed={on === isAi}
          className={segment(on === isAi)}
        >
          <span aria-hidden>{on ? '🤖' : '🎨'}</span>
          {on ? 'AI' : 'Non-AI'}
        </button>
      ))}
    </div>
  )
}

/** The three tabs an artist can be on. The favourites are a second reading list — read and
 *  ordered the same way — and the archive wins over either while it is set. */
export type ArtistList = 'reading' | 'favorites' | 'archive'

const LISTS: { list: ArtistList; emoji: string; label: string }[] = [
  { list: 'reading', emoji: '📋', label: 'Reading list' },
  { list: 'favorites', emoji: '⭐', label: 'Favorites' },
  { list: 'archive', emoji: '🗄️', label: 'Archive' },
]

/** Which tab is on screen — the same segments, one level up from the kind: each of the three
 *  still splits into non-AI and AI. */
export function ArtistListSwitch({
  list,
  onChange,
}: {
  list: ArtistList
  onChange: (list: ArtistList) => void
}) {
  return (
    <div role="group" aria-label="Which list" className={SEGMENTS}>
      {LISTS.map((tab) => (
        <button
          key={tab.list}
          type="button"
          onClick={() => onChange(tab.list)}
          aria-pressed={tab.list === list}
          className={segment(tab.list === list)}
        >
          <span aria-hidden>{tab.emoji}</span>
          {tab.label}
        </button>
      ))}
    </div>
  )
}
