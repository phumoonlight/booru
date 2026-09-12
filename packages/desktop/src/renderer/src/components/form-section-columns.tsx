import { isSpacer, type Tag } from '@common/tags'
import { SectionCard } from './form-section-card'
import { SpacerCard } from './form-section-spacer'
import type { FormSection, FormSectionEdit } from '@common/data/form-sections'

/**
 * What is being dragged, which is two different things onto the same targets: a card
 * reorders the form, a tag files itself. Held in state rather than read off `dataTransfer`,
 * whose contents a dragover is not allowed to see — and the drop has to know which it is
 * before it can decide what to do.
 */
export type Held =
  { kind: 'section'; id: number; side: number; at: number } | { kind: 'tag'; id: number } | null

/**
 * The form as it is arranged: two columns of cards, and the line between them.
 *
 * Cards are *stacked* in each column rather than laid into a flowing grid. A grid places
 * row by row, so every row is as tall as its tallest card and a short card leaves a hole
 * beneath it until the next row starts — with cards this uneven, one holding twelve chips
 * and its neighbour none, that is most of the screen. Two columns of their own is the same
 * arrangement with the holes closed up.
 *
 * Which side a card is on is read off the row (`tag_form_sections.side`), exactly as the
 * form itself reads it, so a card does not change sides because the one before it grew.
 */
export function SectionColumns({
  columns,
  saving,
  tagsOf,
  dragging,
  setDragging,
  over,
  setOver,
  picking,
  showTags,
  depNames,
  onPick,
  onClickTag,
  onFile,
  onPlace,
  onEdit,
}: {
  columns: [FormSection[], FormSection[]]
  saving: boolean
  /** Everything on one row, in the order it is drawn. The screen behind holds the tags. */
  tagsOf: (sectionId: number) => Tag[]
  dragging: Held
  setDragging: (held: Held) => void
  /** What the pointer is over: a card, or the empty space at the foot of a column, which is
   *  how a row reaches the end of a column that has nothing to drop onto down there. */
  over: { kind: 'card'; id: number } | { kind: 'tail'; side: number } | null
  setOver: (over: { kind: 'card'; id: number } | { kind: 'tail'; side: number } | null) => void
  /** Which row is asking for its condition, if any. */
  picking: number | null
  showTags: boolean
  depNames: Set<string>
  onPick: (id: number) => void
  onClickTag: (tag: Tag) => void
  onFile: (tagId: number, sectionId: number) => void
  onPlace: (id: number, side: number, target: number | null, after: boolean) => void
  onEdit: (edit: FormSectionEdit) => void
}) {
  const endDrag = () => {
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="relative grid grid-cols-2 items-start gap-x-4">
      {/* The line between the sides — one rule down the middle of the block rather than a
          border on either column, so it holds however uneven the two sides run, and out of
          the flow so it takes no cell. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
      />
      {columns.map((column, side) => (
        <div
          key={side}
          aria-busy={saving}
          // The column itself takes a drop, which is the only way to reach the end of the
          // shorter one: below its last card there is nothing to aim at, and that empty
          // space is exactly where a row moved across the divider wants to land.
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
            endDrag()
            onPlace(held.id, side, null, false)
          }}
          // Dimmed and inert while a write is out. A reorder is one statement per column and
          // a rename is a round trip, and until either lands what is on screen is what was
          // *sent* — a second drag started against it would be composed on a stale order and
          // land somewhere nobody asked for.
          className={`flex flex-col gap-2 pb-8 transition-opacity ${
            saving ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {column.map((section, at) =>
            // A gap is drawn as one here too, but with its grip and its ✕: this is the
            // screen where it is moved and taken away, so here it has to be something you
            // can point at rather than the nothing it is on the form.
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
                onDragStart={() => setDragging({ kind: 'section', id: section.id, side, at })}
                onDragEnd={endDrag}
                onOver={() => setOver({ kind: 'card', id: section.id })}
                onDrop={() => {
                  const held = dragging
                  endDrag()
                  // A tag cannot go onto a gap — there is nothing on it to be offered from
                  // — so only a card lands here.
                  if (held?.kind !== 'section' || held.id === section.id) return
                  onPlace(held.id, side, section.id, held.side === side && held.at < at)
                }}
                onDelete={() => onEdit({ do: 'delete', id: section.id })}
              />
            ) : (
              <SectionCard
                key={section.id}
                section={section}
                index={at}
                tags={tagsOf(section.id)}
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
                choosing={picking !== null}
                showTags={showTags}
                depNames={depNames}
                onPick={() => onPick(section.id)}
                onClickTag={onClickTag}
                onDragTag={(id) => setDragging({ kind: 'tag', id })}
                onDragSection={() => setDragging({ kind: 'section', id: section.id, side, at })}
                onDragEnd={endDrag}
                onOver={() => setOver({ kind: 'card', id: section.id })}
                onDrop={() => {
                  const held = dragging
                  endDrag()
                  if (!held) return
                  if (held.kind === 'tag') onFile(held.id, section.id)
                  // Behind the card going down its own column, in front of it every other
                  // way — the gap the line was drawn in.
                  else if (held.id !== section.id) {
                    onPlace(held.id, side, section.id, held.side === side && held.at < at)
                  }
                }}
                onRename={(name) => onEdit({ do: 'rename', id: section.id, name })}
                onMode={(mode) => onEdit({ do: 'deps', id: section.id, mode, names: section.deps })}
                onRemoveDep={(name) =>
                  onEdit({
                    do: 'deps',
                    id: section.id,
                    mode: section.depsMode,
                    names: section.deps.filter((dep) => dep !== name),
                  })
                }
                onDelete={() => onEdit({ do: 'delete', id: section.id })}
              />
            )
          )}
          {/* The foot of the column, drawn only while a card is in the air over it: the
              space is a target either way, and a line saying so is the difference between an
              empty column you can use and one that looks broken. */}
          {dragging?.kind === 'section' && (
            <div
              className={`-mt-1 h-8 rounded-lg border border-dashed transition-colors ${
                over?.kind === 'tail' && over.side === side ? 'border-accent' : 'border-border'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
