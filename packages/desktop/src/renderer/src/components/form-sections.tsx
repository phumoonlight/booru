import { useEffect, useState } from 'react'
import {
  categoryColor,
  isSpacer,
  newSpacerName,
  normalizeFormSection,
  type Tag,
} from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON, BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD } from './panel'
import { TagMark } from './category-tag-field'
import { toggleRuleName } from './tag-rule-editor'
import { editFormSections, useFormSections, useFormSectionsSaving } from '../form-sections'
import type { DepsMode, FormSection } from '@common/data/form-sections'

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
 */
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
  const sections = useFormSections()
  const saving = useFormSectionsSaving()
  const [typed, setTyped] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  // What is being dragged, which is two different things onto the same targets: a card
  // reorders the form, a tag files itself. Held rather than read off `dataTransfer`, whose
  // contents a dragover is not allowed to see — and the drop has to know which it is before
  // it can decide what to do.
  const [dragging, setDragging] = useState<
    { kind: 'section'; id: number; side: number; at: number } | { kind: 'tag'; id: number } | null
  >(null)
  // What the pointer is over: a card, or the empty space at the foot of a column, which is
  // how a row reaches the end of a column that has nothing to drop onto down there.
  const [over, setOver] = useState<
    { kind: 'card'; id: number } | { kind: 'tail'; side: number } | null
  >(null)
  // Which section's dependencies the chips are currently answering, if any. The old panel
  // borrowed the Tags grid for this; the chips on this screen are that same list of every
  // tag, so the gesture is kept and the grid it needed is not.
  const [picking, setPicking] = useState<number | null>(null)
  /**
   * Where a tag has been moved this session, over the top of what the board said.
   *
   * The write goes out on the drop and this is what the screen draws until the way out.
   * Re-reading the whole index after every drop would be a query per tag filed, and filing
   * is done in runs of twenty. A write that fails takes its entry back out, so the chip
   * returns to where it came from rather than sitting somewhere the board disagrees with.
   */
  const [moved, setMoved] = useState<Map<number, number | null>>(new Map())

  function leave() {
    if (moved.size > 0) onChanged()
    onClose()
  }

  // Escape backs out one step at a time: out of a pick if one is open, out of the screen
  // otherwise. A single key that did both would close the view on the press meant to stop
  // choosing dependencies. Re-registered every render rather than kept on a dependency
  // list, since what it closes depends on state it would otherwise be holding a stale copy
  // of — one listener either way.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (picking !== null) setPicking(null)
      else leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const apply = async (edit: Parameters<typeof editFormSections>[0]) => {
    setError((await editFormSections(edit)) ?? '')
  }

  /** Which row a tag is on, this screen's moves included. */
  const sectionOf = (tag: Tag): number | null =>
    moved.has(tag.id) ? (moved.get(tag.id) ?? null) : (tag.form_section_id ?? null)

  /**
   * Files one tag onto one row.
   *
   * Optimistic, and put back if the write is refused: the chip has left the pointer by the
   * time the board answers, and a card drawn holding a tag it does not hold is a screen you
   * would go on filing against.
   */
  async function file(tagId: number, sectionId: number) {
    const had = moved.has(tagId)
    const before = moved.get(tagId) ?? null
    setMoved((current) => new Map(current).set(tagId, sectionId))
    setError('')

    const result = await window.api.setTagFormSection(tagId, sectionId)
    if (!result.ok) {
      setMoved((current) => {
        const next = new Map(current)
        if (had) next.set(tagId, before)
        else next.delete(tagId)
        return next
      })
      setError(result.error)
    }
  }

  /**
   * Moves one row into a place: in front of another card, behind it, or onto the end of a
   * column when it was dropped in the space below the last one.
   *
   * Written as both columns at once, which is what makes it exact. A row's side is a column
   * of its own on the board now (`0004_section_sides.sql`); it was the parity of a single
   * flat position, and every awkwardness this gesture had came from that. A flat list has no
   * way to say that one column holds one more than the other, so a row moved across the
   * divider came back on the wrong side of it, and the only crossing that worked at all was
   * a trade with a row already there — which left the foot of the shorter column
   * unreachable. There is nothing to work around now: a row goes where it was dropped, the
   * column it left closes up, and no other row moves.
   */
  const place = (id: number, side: number, target: number | null, after: boolean) => {
    const columns: [number[], number[]] = [
      sections.filter((row) => row.side !== 1).map((row) => row.id),
      sections.filter((row) => row.side === 1).map((row) => row.id),
    ]

    const from = sections.find((row) => row.id === id)
    if (!from) return

    const source = columns[from.side === 1 ? 1 : 0]
    source.splice(source.indexOf(id), 1)

    const into = columns[side === 1 ? 1 : 0]
    // Read after the source column has closed up, which is what makes a move down inside one
    // column land where it looks like it will: `indexOf` is one less than it was, and the
    // `after` the drop already decided is added to that rather than to a stale index.
    const at = target === null ? into.length : into.indexOf(target) + (after ? 1 : 0)
    if (at < 0) return
    into.splice(at, 0, id)

    void apply({ do: 'reorder', columns })
  }

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
    const section = sections.find((row) => row.id === picking)
    if (!section) return
    void apply({
      do: 'deps',
      id: section.id,
      mode: section.depsMode,
      names: toggleRuleName(section.deps, tag.name),
    })
  }

  // Matched against the stored spelling with spaces read as underscores, so the box takes
  // `blue archive` and `blue_archive` alike — the same courtesy every other tag box here
  // does. It narrows the chips and never the cards: a row that vanished because nothing on
  // it matched would be a row you cannot drop onto.
  const typedFilter = filter.trim().toLowerCase().replace(/ /g, '_')
  const visible = (list: Tag[]): Tag[] =>
    typedFilter ? list.filter((tag) => tag.name.includes(typedFilter)) : list

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
          <button type="button" onClick={leave} className={`${BUTTON} ml-auto`}>
            <span aria-hidden>❌</span> Close
          </button>
        </div>

        <p className="max-w-3xl text-sm text-muted">
          The rows the upload form draws, in the order it draws them, and what is on each.
          Drag a tag onto a card to put it on that row. Drag a card by its grip onto another
          card to move the row there — either column — or into the space under a column to
          send it to the end of that one. A tag on no row is not offered anywhere in the form, and taking one back off is
          done on that tag&apos;s own panel. A row may hold tags of any category, and a row with a
          condition is drawn only when the post satisfies it.
        </p>

        <div className="flex flex-wrap gap-2">
          {/* Narrows the chips, which is what makes a board of a few hundred tags something
              you can drag one out of. Its border stays, being the one thing here you type
              into rather than press — and it leads the row, the way Browse's and the Tags
              screen's filters do. */}
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="blue_hair"
            spellCheck={false}
            className={`${FIELD} min-w-40 flex-1 font-mono`}
          />
          <input
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
            <span aria-hidden>➕</span> New section
          </button>
          {/* A row that holds nothing and is drawn as a gap on the form. It needs no name —
              a gap is a gap — so it is its own button rather than a name you would have to
              invent, and it lands on the shorter column like any other new row. */}
          <button
            type="button"
            onClick={() => void apply({ do: 'create', name: newSpacerName() })}
            disabled={saving}
            title="A blank row, for lining the two columns up against each other"
            className={`${BUTTON_ON_SURFACE} disabled:opacity-50`}
          >
            <span aria-hidden>␣</span> Space
          </button>
        </div>

        {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

        {tags === null ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            Loading…
          </p>
        ) : (
          <>
            {/* The unfiled tags, and the reason this screen is worth opening. Dashed, and
                not a drop target: a border that says "things come out of here" without
                pretending to accept them back. */}
            <section className="flex flex-col gap-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                On no row ({unfiled.length})
              </h2>
              <div className="flex min-h-14 flex-wrap content-start items-center gap-1 rounded-lg border border-dashed border-border p-2">
                {visible(unfiled).map((tag) => (
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
                {unfiled.length === 0 && (
                  <p className="px-1 text-xs text-muted">
                    Every tag is on a row — the form offers all of them.
                  </p>
                )}
                {unfiled.length > 0 && visible(unfiled).length === 0 && (
                  <p className="px-1 text-xs text-muted">Nothing here matches “{typedFilter}”.</p>
                )}
              </div>
            </section>

            {sections.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
                No rows yet — the upload form has nothing to offer, since a tag is offered on a
                row or not at all.
              </p>
            ) : (
              // Two columns, and cards *stacked* in each rather than laid into a flowing
              // grid. A grid places row by row, so every row is as tall as its tallest card
              // and a short card leaves a hole beneath it until the next row starts — with
              // cards this uneven, one holding twelve chips and its neighbour none, that is
              // most of the screen. Two columns of their own is the same arrangement with
              // the holes closed up.
              //
              // Which side by position, odd left and even right, the way the form itself
              // does it: the numbers still read 1, 2 across and 1, 3, 5 down, and a card
              // does not change sides because the one before it grew.
              <div className="relative grid grid-cols-2 items-start gap-x-4">
                {/* The line between the sides — one rule down the middle of the block rather
                    than a border on either column, so it holds however uneven the two sides
                    run, and out of the flow so it takes no cell. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
                />
                {columns.map((column, side) => (
                  <div
                    key={side}
                    aria-busy={saving}
                    // The column itself takes a drop, which is the only way to reach the end
                    // of the shorter one: below its last card there is nothing to aim at, and
                    // that empty space is exactly where a row moved across the divider wants
                    // to land.
                    onDragOver={(event) => {
                      if (dragging?.kind !== 'section') return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      setOver({ kind: 'tail', side })
                    }}
                    onDrop={(event) => {
                      if (dragging?.kind !== 'section') return
                      event.preventDefault()
                      const held = dragging
                      setDragging(null)
                      setOver(null)
                      place(held.id, side, null, false)
                    }}
                    // Dimmed and inert while a write is out. A reorder is one statement per
                    // column and a rename is a round trip, and until either lands what is on
                    // screen is what was *sent* — a second drag started against it would be
                    // composed on a stale order and land somewhere nobody asked for.
                    className={`flex flex-col gap-2 pb-8 transition-opacity ${
                      saving ? 'pointer-events-none opacity-50' : ''
                    }`}
                  >
                    {column.map((section, at) =>
                      // A gap is drawn as one here too, but with its grip and its ✕: this is
                      // the screen where it is moved and taken away, so here it has to be
                      // something you can point at rather than the nothing it is on the form.
                      isSpacer(section.name) ? (
                        <SpacerCard
                          key={section.id}
                          over={
                            over?.kind === 'card' &&
                            over.id === section.id &&
                            dragging?.kind === 'section' &&
                            dragging.id !== section.id
                              ? dragging.side === side && dragging.at < at
                                ? 'below'
                                : 'above'
                              : null
                          }
                          onDragStart={() =>
                            setDragging({ kind: 'section', id: section.id, side, at })
                          }
                          onDragEnd={() => {
                            setDragging(null)
                            setOver(null)
                          }}
                          onOver={() => setOver({ kind: 'card', id: section.id })}
                          onDrop={() => {
                            const held = dragging
                            setDragging(null)
                            setOver(null)
                            // A tag cannot go onto a gap — there is nothing on it to be
                            // offered from — so only a card lands here.
                            if (held?.kind !== 'section' || held.id === section.id) return
                            place(held.id, side, section.id, held.side === side && held.at < at)
                          }}
                          onDelete={() => void apply({ do: 'delete', id: section.id })}
                        />
                      ) : (
                        <SectionCard
                          key={section.id}
                          section={section}
                          index={at}
                          tags={visible(byName(all.filter((tag) => sectionOf(tag) === section.id)))}
                          held={all.filter((tag) => sectionOf(tag) === section.id).length}
                          over={
                            over?.kind !== 'card' || over.id !== section.id || dragging === null
                              ? null
                              : dragging.kind === 'tag'
                                ? 'tag'
                                : dragging.id === section.id
                                  ? null
                                  : dragging.side === side && dragging.at < at
                                    ? 'below'
                                    : 'above'
                          }
                          picking={picking === section.id}
                          depNames={depNames}
                          onPick={() => setPicking(picking === section.id ? null : section.id)}
                          onClickTag={clickTag}
                          onDragTag={(id) => setDragging({ kind: 'tag', id })}
                          onDragSection={() =>
                            setDragging({ kind: 'section', id: section.id, side, at })
                          }
                          onDragEnd={() => {
                            setDragging(null)
                            setOver(null)
                          }}
                          onOver={() => setOver({ kind: 'card', id: section.id })}
                          onDrop={() => {
                            const held = dragging
                            setDragging(null)
                            setOver(null)
                            if (!held) return
                            if (held.kind === 'tag') void file(held.id, section.id)
                            // Behind the card going down its own column, in front of it every
                            // other way — the gap the line was drawn in.
                            else if (held.id !== section.id) {
                              place(held.id, side, section.id, held.side === side && held.at < at)
                            }
                          }}
                          onRename={(name) => void apply({ do: 'rename', id: section.id, name })}
                          onMode={(mode) =>
                            void apply({ do: 'deps', id: section.id, mode, names: section.deps })
                          }
                          onRemoveDep={(name) =>
                            void apply({
                              do: 'deps',
                              id: section.id,
                              mode: section.depsMode,
                              names: section.deps.filter((dep) => dep !== name),
                            })
                          }
                            onDelete={() => void apply({ do: 'delete', id: section.id })}
                          />
                      )
                    )}
                    {/* The foot of the column, drawn only while a card is in the air over it:
                        the space is a target either way, and a line saying so is the
                        difference between an empty column you can use and one that looks
                        broken. */}
                    {dragging?.kind === 'section' && (
                      <div
                        className={`-mt-1 h-8 rounded-lg border border-dashed transition-colors ${
                          over?.kind === 'tail' && over.side === side
                            ? 'border-accent'
                            : 'border-border'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * One row of the form, as a card: what it is called, what it waits for, and what is on it.
 *
 * The card *is* the drop target, all of it — a tag let go anywhere on it lands on this row.
 * A card that only accepted a drop over its chips would be a target that shrinks as the row
 * empties, which is exactly backwards: an empty row is the one you are aiming at.
 */
function SectionCard({
  section,
  index,
  tags,
  held,
  over,
  picking,
  depNames,
  onPick,
  onClickTag,
  onDragTag,
  onDragSection,
  onDragEnd,
  onOver,
  onDrop,
  onRename,
  onMode,
  onRemoveDep,
  onDelete,
}: {
  section: FormSection
  index: number
  /** What to draw, after the filter. */
  tags: Tag[]
  /** What it actually holds, so the count does not drop as the filter narrows. */
  held: number
  /**
   * What letting go here would do, or null for nothing. A tag lands *on* this card, so the
   * card lights up; another card lands in the gap above or below it, so the gap does — a
   * line between two cards reads as a destination where a lit card reads as a thing being
   * landed on, which is the difference between the two kinds of drop and worth knowing
   * before letting go.
   */
  over: 'tag' | 'above' | 'below' | null
  picking: boolean
  depNames: Set<string>
  onPick: () => void
  onClickTag: (tag: Tag) => void
  onDragTag: (id: number) => void
  onDragSection: () => void
  onDragEnd: () => void
  onOver: () => void
  onDrop: () => void
  onRename: (name: string) => void
  onMode: (mode: DepsMode) => void
  onRemoveDep: (name: string) => void
  onDelete: () => void
}) {
  return (
    <div
      onDragOver={(event) => {
        // Without this the drop is refused: the default for a dragover is "you cannot drop
        // here".
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        // The column behind this card is a drop target too — it is how a row reaches the
        // foot of a column — and an event that goes on bubbling reaches it as well, so a
        // card dropped onto another was placed there and then immediately moved to the end
        // of the column by the handler above. Both handlers ran; the second one won.
        event.stopPropagation()
        onOver()
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDrop()
      }}
      className={`flex flex-col rounded-lg border bg-surface transition-colors ${
        over === 'tag' ? 'border-accent' : 'border-border'
      } ${over === 'above' ? 'border-t-2 border-t-accent' : ''} ${
        over === 'below' ? 'border-b-2 border-b-accent' : ''
      }`}
    >
      <div className="flex items-center gap-1 border-b border-border px-1 py-1">
        {/* The grip is what is draggable, not the card: the card holds a text field, and a
            `draggable` ancestor takes the pointer's selection of that text away. It is also
            the honest answer to "what here can I pick up" on a card that is otherwise a drop
            target for something else entirely. */}
        <span
          draggable
          onDragStart={(event) => {
            onDragSection()
            event.dataTransfer.effectAllowed = 'move'
            // Some sources refuse to start a drag with nothing on the transfer.
            event.dataTransfer.setData('text/plain', section.name)
          }}
          onDragEnd={onDragEnd}
          aria-hidden
          title="Drag onto another card to move this row there, or below a column to send it to the end"
          className="w-5 shrink-0 cursor-grab text-center text-xs text-muted active:cursor-grabbing"
        >
          ⠿
        </span>
        <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted">
          {index + 1}
        </span>
        <SectionName name={section.name} onRename={onRename} />
        <span className="shrink-0 text-xs tabular-nums text-muted">{held}</span>
        {/* No confirmation: the tags on this row are not deleted with it. The foreign key is
            `on delete set null`, so they go back to being on no row — a re-file rather than a
            loss, and they reappear in the strip at the top of this screen. */}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remove the ${section.name} row`}
          title="Remove this row — its tags go back to being on no row"
          className={`${BUTTON_ON_SURFACE} hover:text-[#ff5d5f]`}
        >
          ✕
        </button>
      </div>

      <SectionDeps
        section={section}
        picking={picking}
        onPick={onPick}
        onMode={onMode}
        onRemove={onRemoveDep}
      />

      <div className="flex min-h-16 flex-wrap content-start gap-1 p-2">
        {tags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onSurface
            picking={picking}
            chosen={depNames.has(tag.name)}
            onClick={() => onClickTag(tag)}
            onDragStart={() => onDragTag(tag.id)}
            onDragEnd={onDragEnd}
          />
        ))}
        {tags.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted">
            {held === 0 ? 'Drag a tag here.' : 'Nothing on this row matches.'}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * A gap, on the screen where gaps are arranged.
 *
 * On the form it is a blank space and nothing else, which is the whole of what it is for:
 * the two columns hold different numbers of rows and different amounts of tag, and a gap is
 * how a row on one side is brought level with a row on the other. Here it has to be a thing
 * — something to pick up, move and take away — so it is a short card saying what it is, with
 * the same grip and the same ✕ as a row of tags.
 *
 * Nothing else on it. It has no name to edit (its name is a made-up key nobody should read),
 * no condition, and no tags: a tag cannot be offered from a space.
 */
function SpacerCard({
  over,
  onDragStart,
  onDragEnd,
  onOver,
  onDrop,
  onDelete,
}: {
  over: 'above' | 'below' | null
  onDragStart: () => void
  onDragEnd: () => void
  onOver: () => void
  onDrop: () => void
  onDelete: () => void
}) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        // The column behind is a drop target too, so the event must stop here — see the
        // same guard on `SectionCard`.
        event.stopPropagation()
        onOver()
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDrop()
      }}
      // Dashed and on the page's own ground rather than a card's: it is a hole in the
      // column, and drawing it as a card would make it look like a row that had lost its
      // contents.
      className={`flex items-center gap-1 rounded-lg border border-dashed px-1 py-1 ${
        over === 'above' ? 'border-t-2 border-t-accent' : ''
      } ${over === 'below' ? 'border-b-2 border-b-accent' : ''} border-border`}
    >
      <span
        draggable
        onDragStart={(event) => {
          onDragStart()
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', 'space')
        }}
        onDragEnd={onDragEnd}
        aria-hidden
        title="Drag to move this space"
        className="w-5 shrink-0 cursor-grab text-center text-xs text-muted active:cursor-grabbing"
      >
        ⠿
      </span>
      <span className="flex-1 text-xs uppercase tracking-wide text-muted">Space</span>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Remove this space"
        title="Remove this space"
        className={`${BUTTON_ON_SURFACE} hover:text-[#ff5d5f]`}
      >
        ✕
      </button>
    </div>
  )
}

/**
 * One tag, drawn as it is everywhere else — its mark, its name, its category's colour — and
 * draggable, which is the gesture this screen is built on.
 *
 * While a card is asking for its dependencies it is a button instead, and says whether it is
 * in the condition. The same two meanings the Tags grid has, for the same reason: there is
 * one list of every tag on the screen, and a pick has to be answered from it.
 */
function TagChip({
  tag,
  onSurface = false,
  picking,
  chosen,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  tag: Tag
  /** Inside a card, so the chip takes the other ground — the same step
   *  `BUTTON_ON_SURFACE` is for. */
  onSurface?: boolean
  picking: boolean
  chosen: boolean
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return (
    <button
      type="button"
      // Not while picking: a chip that both answers a question and can be dragged out of the
      // row it is answering from fires the wrong one about half the time.
      draggable={!picking}
      onDragStart={(event) => {
        onDragStart()
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', tag.name)
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={
        picking
          ? chosen
            ? `Stop this row waiting for ${tagLabel(tag.name)}`
            : `Wait for ${tagLabel(tag.name)}`
          : `Drag ${tagLabel(tag.name)} onto a row`
      }
      className={`flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs transition-colors ${
        picking ? '' : 'cursor-grab active:cursor-grabbing'
      } ${
        chosen && picking
          ? 'border-accent bg-accent/10'
          : `border-border ${onSurface ? 'bg-background' : 'bg-surface'} hover:border-accent`
      } ${categoryColor(tag.category)}`}
    >
      <TagMark mark={tag.mark} />
      {tagLabel(tag.name)}
      {picking && (
        <span aria-hidden className={chosen ? 'text-accent' : 'text-muted'}>
          {chosen ? '✓' : '＋'}
        </span>
      )}
    </button>
  )
}

/**
 * What a section waits for: a mode, its tags, and the button that turns the chips on this
 * screen into the picker for them.
 *
 * A section with no dependencies is always drawn in the form, which is most of them, so the
 * quiet state is one word — Always — and not an empty list of nothing. The condition appears
 * as you give it one.
 *
 * The tags are **picked, never typed**, the same gesture a tag rule and a catalog are filled
 * in with and for the same reason: a condition may only ever name tags the board has, and
 * every one of them is on the screen already.
 */
function SectionDeps({
  section,
  picking,
  onPick,
  onMode,
  onRemove,
}: {
  section: FormSection
  picking: boolean
  onPick: () => void
  onMode: (mode: DepsMode) => void
  onRemove: (name: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
      {section.deps.length === 0 ? (
        <span className="text-xs text-muted">Always shown</span>
      ) : (
        <>
          {/* Two positions, so a toggle rather than a menu: it reads as the word it is
              currently on, and pressing it is the other one. Accent because it is the one
              part of the condition that is not a tag and would otherwise disappear among
              them. */}
          <button
            type="button"
            onClick={() => onMode(section.depsMode === 'any' ? 'all' : 'any')}
            title={
              section.depsMode === 'any'
                ? 'Shown when any one of these is on the post — press for all'
                : 'Shown only when all of these are on the post — press for any'
            }
            className={`${BUTTON_ON_SURFACE} font-semibold text-accent`}
          >
            {section.depsMode === 'any' ? 'Any' : 'All'}
          </button>
          {section.deps.map((name) => (
            <span
              key={name}
              className="flex items-center rounded border border-border bg-background pl-2 font-mono text-xs"
            >
              {name}
              <button
                type="button"
                onClick={() => onRemove(name)}
                aria-label={`Stop ${section.name} waiting for ${name}`}
                className="flex min-h-6 items-center px-1.5 text-muted hover:text-[#ff5d5f]"
              >
                ✕
              </button>
            </span>
          ))}
        </>
      )}
      <button
        type="button"
        onClick={onPick}
        title={
          picking ? 'Stop choosing' : 'Click tags on this screen to say what this row waits for'
        }
        className={`${BUTTON_ON_SURFACE} ml-auto ${
          picking ? 'bg-accent/15 font-semibold text-accent' : 'text-accent'
        }`}
      >
        {picking ? '✅ Done' : '👆 Choose'}
      </button>
    </div>
  )
}

/**
 * A row's name, edited in place.
 *
 * Written on blur and on Enter rather than on every keystroke: a rename is a round trip and
 * a row that renamed itself letter by letter would be a dozen writes and a dozen chances for
 * two of them to land out of order. Escape puts the stored name back, which is the way out
 * of a half-typed edit that a text field otherwise does not have.
 *
 * Keyed on nothing: the value is local while you are in the box and the board's again the
 * moment you leave it, so a rename that fails simply reappears as it was.
 */
function SectionName({ name, onRename }: { name: string; onRename: (next: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    const next = draft
    setDraft(null)
    if (next !== null && normalizeFormSection(next) && normalizeFormSection(next) !== name) {
      onRename(next)
    }
  }

  return (
    <input
      value={draft ?? name}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setDraft(null)
      }}
      aria-label={`Rename ${name}`}
      spellCheck={false}
      // Borderless at rest, so a grid of cards reads as cards rather than as boxes inside
      // boxes; the border arrives on focus, which is when it is a field.
      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-sm font-semibold outline-none hover:border-border focus:border-accent"
    />
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
