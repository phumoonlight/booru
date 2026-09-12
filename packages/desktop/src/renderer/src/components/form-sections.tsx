import { useEffect, useState } from 'react'
import { newSpacerName, normalizeFormSection, type Tag } from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON, BUTTON_SUBMIT_ON_SURFACE, buttonToggle, SEGMENTS, segment } from './buttons'
import { FIELD } from './panel'
import { toggleRuleName } from './tag-rule-editor'
import { TagChip } from './form-section-chip'
import { SectionColumns, type Held } from './form-section-columns'
import { useSectionEditing } from './form-section-editing'
import type { FormSection } from '@common/data/form-sections'

/**
 * The form's rows and everything on them, as a screen of its own — `tag_form_sections`,
 * and `tags.form_section_id` pointing at one.
 *
 * It was a panel above the Tags grid: the rows as a list of lines, and which row a tag sat
 * on set one tag at a time from a menu on that tag's own panel. Both halves were the same
 * mistake. Filing a vocabulary is a job about *sets* — thirty tags that ought to be on four
 * rows — and a menu per tag makes that thirty trips through a panel showing one name at a
 * time, with no way to see what a row already holds while deciding what else belongs on it.
 * Here the rows are cards with their tags inside them, so the screen answers the question
 * actually being asked: what is on this row, and what is on no row at all.
 *
 * A separate view rather than a panel, the way the 🗺️ Rule map is, and for the same reason:
 * it wants the whole window, and the grid underneath would be a second list of every tag
 * saying nothing this one does not.
 *
 * **Unfiled tags are at the top**, which is where the work starts. They are the ones the
 * vocabulary has not decided about, and they are invisible everywhere else — the form does
 * not offer them and the grid draws them among their category's.
 *
 * **A tag is filed by dragging it onto a card.** The drop is the whole edit; there is no
 * Save, like the post editor and the rule panel. The strip at the top is deliberately *not*
 * a drop target: filing is the decision this screen is for, and unfiling is a different one
 * — a tag pulled off its row stops being offered anywhere, which is a thing to do on that
 * tag's own panel, having gone looking for it, rather than by letting go a few pixels short
 * of a card.
 *
 * The cards themselves are `form-section-card.tsx` and the arrangement is
 * `form-section-columns.tsx`; the writes behind every gesture here are `useSectionEditing`.
 */

/**
 * How much of a card is drawn. Module-level for the reason Browse's layout is: this view is
 * unmounted whenever something is in front of it, and a way of looking you chose a minute ago
 * is not a thing to choose again. Not written out — a preference, and not one worth being
 * `save.json`'s.
 *
 * Detailed is the screen as it was: the condition, and every tag on the row. Compact is the
 * names alone, which is what the *order* is read from — twenty rows of chips is a page of
 * scrolling to answer "what comes after what", and dragging a card the length of it.
 */
let detail: 'detailed' | 'compact' = 'detailed'

export function FormSectionsView({
  tags,
  onClose,
  onChanged,
}: {
  /** The board's tags, from the screen behind — it has them already, and a second read
   *  here would be the same query for the same list. */
  tags: Tag[] | null
  onClose: () => void
  /** Something was filed. The screen behind re-reads on the way out rather than after every
   *  drop: filing is done in runs, and a re-read per drop is a query per tag moved. */
  onChanged: () => void
}) {
  const { sections, saving, error, moved, sectionOf, apply, file, place } = useSectionEditing()
  const [typed, setTyped] = useState('')
  const [detailed, setDetailed] = useState(detail === 'detailed')
  // Whether the box that names a new row is open. Not module-level like `detail`: a half-typed
  // name is not a way of looking at the screen, and a box left open from last time would be a
  // caret waiting on a screen you came back to for something else.
  const [naming, setNaming] = useState(false)
  const [dragging, setDragging] = useState<Held>(null)
  const [over, setOver] = useState<
    { kind: 'card'; id: number } | { kind: 'tail'; side: number } | null
  >(null)
  // Which section's dependencies the chips are currently answering, if any. The old panel
  // borrowed the Tags grid for this; the chips on this screen are that same list of every
  // tag, so the gesture is kept and the grid it needed is not.
  const [picking, setPicking] = useState<number | null>(null)

  function leave() {
    if (moved.size > 0) onChanged()
    onClose()
  }

  // Escape backs out one step at a time: out of a pick, then out of the box that names a new
  // row, and only then out of the screen. A single key that went straight to the last of
  // those would close the view on the press meant to stop choosing dependencies, or on the
  // one meant to abandon a half-typed name. Re-registered every render rather than kept on a
  // dependency list, since what it closes depends on state it would otherwise be holding a
  // stale copy of — one listener either way.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (picking !== null) setPicking(null)
      else if (naming) setNaming(false)
      else leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const add = () => {
    if (!normalizeFormSection(typed)) return
    void apply({ do: 'create', name: typed })
    setTyped('')
  }

  /** A chip's click means one of two things, exactly as the Tags grid's did: ordinarily
   *  nothing — it is a thing you drag — and while a card is asking for its dependencies, it
   *  toggles that tag into the condition. */
  const clickTag = (tag: Tag) => {
    if (picking === null) return
    // A row cannot wait for a tag that is on it — see `editFormSections`, which refuses the
    // same pair at the board. Guarded here as well so the chips on the row doing the asking
    // are simply not answers: a click that goes out and comes back as an error is a worse
    // way to say "not that one" than a chip that never offered itself.
    if (sectionOf(tag) === picking) return
    const section = sections.find((row) => row.id === picking)
    if (!section) return
    void apply({
      do: 'deps',
      id: section.id,
      mode: section.depsMode,
      names: toggleRuleName(section.deps, tag.name),
    })
  }

  const byName = (list: Tag[]): Tag[] =>
    [...list].sort((a, b) => tagLabel(a.name).localeCompare(tagLabel(b.name)))

  const all = tags ?? []
  const unfiled = byName(all.filter((tag) => sectionOf(tag) === null))

  /** The two sides, as the board says — `side` on the row, not the parity of anything. */
  const columns: [FormSection[], FormSection[]] = [
    sections.filter((row) => row.side !== 1),
    sections.filter((row) => row.side === 1),
  ]
  const depNames = new Set(
    picking === null ? [] : (sections.find((row) => row.id === picking)?.deps ?? [])
  )

  /**
   * Compact is overridden while a row is asking for its condition: the answer is a tag, and
   * a screen of names alone would hide every chip a pick is answered from. The choice itself
   * is left alone underneath, so ending the pick puts compact back.
   */
  const showTags = detailed || picking !== null

  return (
    // Opaque rather than a scrim, like the rule map: this is the whole vocabulary laid out,
    // and the grid showing through would be the same names again in another arrangement.
    <div className="fixed inset-0 z-30 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            <span aria-hidden>🧱</span> Form sections
          </h1>
          <span className="text-xs text-muted">
            {sections.length} row{sections.length === 1 ? '' : 's'} · {unfiled.length} on no row
          </span>
          <Saving on={saving} />
          {/* Folded, because naming a row is a thing done once in a sitting and the box was
              on screen for the whole of every other one — a field with a caret in it at the
              top of a screen otherwise made of drag targets, and the width of the window
              given to the rarest control on it. A gap needs no name and so needs no form:
              its ➕ makes one on the press, where the other opens the box that names one. */}
          <button type="button" onClick={() => setNaming(!naming)} className={buttonToggle(naming)}>
            <span aria-hidden>➕</span> New section
          </button>
          {/* A row that holds nothing and is drawn as a gap on the form. It needs no name —
              a gap is a gap — so it is its own button rather than a name you would have to
              invent, and it lands on the shorter column like any other new row. It takes the
              same ➕ as the button beside it, both making a row; ␣ was the thing being made
              rather than the making of it, and at this size read as a speck. */}
          <button
            type="button"
            onClick={() => void apply({ do: 'create', name: newSpacerName() })}
            disabled={saving}
            title="A blank row, for lining the two columns up against each other"
            className={BUTTON}
          >
            <span aria-hidden>➕</span> Space
          </button>
          {/* Two ways of looking at the same rows, drawn as the switch it is — see `SEGMENTS`.
              The same control Browse's layout pair and the header's board switch are. */}
          <div role="group" aria-label="Detail" className={`ml-auto ${SEGMENTS}`}>
            <button
              type="button"
              onClick={() => {
                detail = 'detailed'
                setDetailed(true)
              }}
              aria-pressed={detailed}
              title="Each row with its condition and every tag on it"
              className={segment(detailed)}
            >
              <span aria-hidden>🧾</span> Detailed
            </button>
            <button
              type="button"
              onClick={() => {
                detail = 'compact'
                setDetailed(false)
              }}
              aria-pressed={!detailed}
              title="Names alone — the order at a glance"
              className={segment(!detailed)}
            >
              <span aria-hidden>📋</span> Compact
            </button>
          </div>
          <button type="button" onClick={leave} className={BUTTON}>
            <span aria-hidden>❌</span> Close
          </button>
        </div>

        <p className="max-w-3xl text-sm text-muted">
          The upload form&apos;s rows. Drag a tag onto a card to file it; drag a card by its grip to
          move the row. A tag on no row is offered nowhere.
        </p>

        {/* No tag filter here, unlike the Tags grid. A filter narrows what is drawn, and what
            is drawn on this screen is *where things are* — a card holding three of its twelve
            tags is a row you would then file against a picture of itself, and a chip dragged
            out of one lands on a card whose contents you have been shown a fraction of.
            Finding one tag is the Tags screen's job, one click away; this one is for reading
            the rows. */}
        {naming && (
          <div className="flex flex-wrap gap-2">
            {/* Focused on the way in, since it is the only reason the row is here, and closing
                on Escape — the way out a text field otherwise does not have, and the same key
                the rest of this screen backs out with. It stays open on Create: naming rows is
                done in runs, and the one press that ends the run is the ➕ above. */}
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && add()}
              placeholder="hair color"
              spellCheck={false}
              className={`${FIELD} min-w-40 flex-1`}
            />
            <button
              type="button"
              onClick={add}
              disabled={saving || normalizeFormSection(typed) === null}
              className={`${BUTTON_SUBMIT_ON_SURFACE} disabled:opacity-50`}
            >
              <span aria-hidden>➕</span> Create
            </button>
          </div>
        )}

        {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

        {tags === null ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            Loading…
          </p>
        ) : (
          <>
            {/* The unfiled tags, and the reason this screen is worth opening. Dashed, and
                not a drop target: a border that says "things come out of here" without
                pretending to accept them back.

                Gone entirely when there are none, rather than an empty box saying so. It is
                a pile of work to get through, and a pile with nothing in it is not a state
                worth drawing — the count in the heading above already says none, and the
                sentence that used to sit here was a line of reassurance taking the height of
                a row of chips at the top of every screenful. */}
            {unfiled.length > 0 && (
              <section className="flex flex-col gap-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  On no row ({unfiled.length})
                </h2>
                <div className="flex min-h-14 flex-wrap content-start items-center gap-1 rounded-lg border border-dashed border-border p-2">
                  {unfiled.map((tag) => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      picking={picking !== null}
                      chosen={depNames.has(tag.name)}
                      onClick={() => clickTag(tag)}
                      onDragStart={() => setDragging({ kind: 'tag', id: tag.id })}
                      onDragEnd={() => {
                        setDragging(null)
                        setOver(null)
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {sections.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
                No rows yet — the upload form has nothing to offer, since a tag is offered on a row
                or not at all.
              </p>
            ) : (
              <SectionColumns
                columns={columns}
                saving={saving}
                tagsOf={(id) => byName(all.filter((tag) => sectionOf(tag) === id))}
                dragging={dragging}
                setDragging={setDragging}
                over={over}
                setOver={setOver}
                picking={picking}
                showTags={showTags}
                depNames={depNames}
                onPick={(id) => setPicking(picking === id ? null : id)}
                onClickTag={clickTag}
                onFile={(tagId, sectionId) => void file(tagId, sectionId)}
                onPlace={place}
                onEdit={(edit) => void apply(edit)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The one word this screen says back, drawn always and faded rather than mounted on demand
 * so the heading row does not reflow the moment a row is moved. The same control the rule
 * editor draws, for the same reason: every press here is a round trip to the board.
 */
function Saving({ on }: { on: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`flex items-center gap-1.5 text-xs transition-opacity ${
        on ? 'text-accent' : 'opacity-0'
      }`}
    >
      {/* A ring rather than a glyph: the emoji this app reaches for first would be spinning a
          picture of something, and what is wanted is the plainest possible "wait". Drawn
          always, so the row does not reflow the moment a drop lands. */}
      <span
        aria-hidden
        className="size-3 animate-spin rounded-full border border-accent border-t-transparent"
      />
      saving…
    </span>
  )
}
