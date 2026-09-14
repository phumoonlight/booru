import { SEGMENTS, segment } from './buttons'

/**
 * Non-AI or AI, as the pair of segments every two-position control in this window is. Used
 * three times — which list the screen shows, what a new artist is saved as, and what an
 * existing one is — so the two labels are spelled once.
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
