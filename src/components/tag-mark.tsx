import { markColor } from '@common/tags'

/**
 * What a shelf tag carries in front of its name: a colour as a dot, anything else as text.
 * `markColor` makes that decision for the desktop app's `TagMark` too, so a tag reads the
 * same in both windows. A copy of that component rather than a shared one, because
 * `packages/common` holds no React (invariant 4).
 */
export function TagMark({ mark }: { mark: string | null }) {
  if (!mark) return null

  const color = markColor(mark)
  if (!color) {
    return (
      <span aria-hidden className="leading-none">
        {mark}
      </span>
    )
  }

  // The border keeps white and black from vanishing into the grounds they would match.
  return (
    <span
      aria-hidden
      style={{ background: color }}
      className="size-3 shrink-0 rounded-full border border-border"
    />
  )
}
