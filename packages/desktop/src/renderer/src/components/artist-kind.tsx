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

/** The reading list or the archive — the same pair of segments, one level up from the kind:
 *  each of the two lists still splits into non-AI and AI. */
export function ArtistListSwitch({
  archive,
  onChange,
}: {
  archive: boolean
  onChange: (archive: boolean) => void
}) {
  return (
    <div role="group" aria-label="Reading list or archive" className={SEGMENTS}>
      {[false, true].map((on) => (
        <button
          key={String(on)}
          type="button"
          onClick={() => onChange(on)}
          aria-pressed={on === archive}
          className={segment(on === archive)}
        >
          <span aria-hidden>{on ? '🗄️' : '📋'}</span>
          {on ? 'Archive' : 'Reading list'}
        </button>
      ))}
    </div>
  )
}
