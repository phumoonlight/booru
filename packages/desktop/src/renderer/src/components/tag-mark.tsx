import { markColor } from '@common/tags'

/**
 * What a tag carries in front of its name — one mark, from the tag's own row.
 *
 * A colour is a dot, anything else is drawn as text; `markColor` is the whole of that
 * decision and it is shared with the website, so a tag looks the same in both windows.
 *
 * There used to be a second, unrelated mark here: a colour dot guessed from the *name*,
 * painted on any tag beginning with a word from a list in code. It read `gold_trim` as
 * gold and `golden_retriever` as gold too, said nothing about a colour the list had never
 * heard of, and could not be corrected on the one tag it got wrong. A guess that cannot be
 * overridden is worse than no guess, so the dot is asked for now — typed into the same box
 * the emoji goes in, which is why they are one column and why only one of them can win.
 *
 * Drawn on the chips a post already carries as well as the ones offered, so a tag looks
 * the same before and after it is picked.
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

  return (
    <span
      aria-hidden
      // The border keeps white and black from disappearing into the two grounds they
      // would otherwise match.
      style={{ background: color }}
      className="size-3 shrink-0 rounded-full border border-border"
    />
  )
}
