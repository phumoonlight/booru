/**
 * The bordered card the Tags screen puts every form in, and the field inside it.
 *
 * They were defined in `tag-index.tsx`, where the three panels that first used them live.
 * The catalogs panel is a fourth and sits in a file of its own — a panel that manages named
 * sets of tags has nothing to do with the tag grid beyond borrowing its chrome — so the
 * chrome moved here rather than being imported back out of the screen that also imports the
 * panel, which is a cycle.
 */

/** The shared shell for the panels: a bordered card that names what it is. */
export function Panel({
  title,
  children,
  actions,
  pinned = false,
}: {
  title: string
  children: React.ReactNode
  /**
   * What the panel does *as a panel* — leave it, open it elsewhere, destroy it — beside
   * its heading rather than below its fields. They are not part of the form: Save answers
   * the two boxes, these answer the tag, and mixing the two put Close where a return key
   * lands and Delete a tab away from a text field.
   */
  actions?: React.ReactNode
  /**
   * Stay at the top of the scroller while the list moves under it. Two panels need it, and
   * for one reason: the tag grid below is what they are being filled in from. The edit
   * panel is opened by clicking a row that can be a screen and a half down a board's worth
   * of tags, and the catalogs panel spends its time being answered by clicks on that same
   * grid — in both cases the panel would otherwise scroll away from the thing it is about.
   *
   * Sticky rather than moving the panel down beside the row: the list is a four-column
   * grid, and a form spliced into it either breaks the columns or pushes the row you are
   * comparing against out of view. Pinned, both stay on screen at once.
   */
  pinned?: boolean
}) {
  const card = (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  )

  if (!pinned) return card

  // The gap above the card is part of what sticks, so the list scrolls *under* a strip of
  // page rather than up against the header. `-mt-4` and `pt-4` are the parent's own
  // `gap-4` taken back and reinstated as padding: at rest the spacing is unchanged, and
  // pinned it is an opaque band nothing can show through.
  return (
    <div className="sticky top-0 z-10 -mt-4 bg-background pt-4 shadow-lg shadow-background/80">
      {card}
    </div>
  )
}

export const FIELD =
  'min-h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent'
