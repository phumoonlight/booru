import { useState } from 'react'
import {
  TAG_CATEGORIES,
  categoryColor,
  categoryLabel,
  normalizeFormSection,
  type TagCategory,
} from '@common/tags'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD, Panel } from './panel'
import { editFormSections, useFormSections, useFormSectionsSaving } from '../form-sections'
import type { DepsMode, FormSection } from '@common/data/form-sections'

/**
 * The rows the tag form draws under one category, and their order — `tag_form_section`.
 *
 * It is here rather than on each tag's own panel because a section is not about a tag: it
 * is a division of a *category*, made once and then filed into, the way a category itself
 * is a line in `TAG_CATEGORIES`. A tag says which section it is on; this says which sections
 * there are.
 *
 * **The order is the whole point.** A–Z is an index's order, not a form's: you tag hair,
 * then clothes, then what is showing, and alphabetically that is `accessory`, `body`,
 * `clothes`, `exposure`, `hair color` — the same rows in the order nobody works.
 *
 * Reordering is a **drag**, by the grip at the left of each row. The upload queue reached
 * the opposite conclusion and it is not a contradiction: a queue card was most of the
 * window, so the place you were dragging to was off-screen as often as not and a press per
 * position was steadier. These are eight or ten rows of one line each, all of them visible
 * at once — the case a drag is actually for, where the whole point is putting *this* one
 * *there* rather than nudging it past its neighbour four times.
 *
 * What that costs is the keyboard: ▲▼ were two buttons anything could press, and a drag is
 * a pointer or nothing.
 *
 * **A name is editable in place**, and the tags on it follow. That is what a row having an
 * id buys and it is the reason this table has them: when the name was the identity, fixing
 * a spelling made a *different* section and every tag on the old one fell quietly off the
 * form. Now it is one update to one row.
 *
 * A section may be named before anything is on it, which free text on each tag could not
 * do — the other half of why this is a table — so ➕ leaves a row with a ＋ in the form and
 * nothing on it, waiting.
 *
 * Every control writes on use, like the post editor and the rule panel: there is no Save.
 * A refusal comes back as a line under the row rather than as a thrown channel, because
 * every one of them is something you can fix in the field still on screen.
 */
export function FormSectionsPanel({
  category,
  onCategory,
  picking,
  onPick,
  onClose,
}: {
  category: TagCategory
  /** Which category is being edited — held by the screen, so the panel can be reopened on
   *  the one you were last dividing rather than starting over at Artist. */
  onCategory: (next: TagCategory) => void
  /** The section whose dependencies the tag grid below is currently filling in, if any. */
  picking: number | null
  onPick: (id: number | null) => void
  onClose: () => void
}) {
  const sections = useFormSections()
  const saving = useFormSectionsSaving()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  // The row being dragged and the row it is currently over, both by index. Held rather than
  // reordered live: the list belongs to the store, and reordering it under the pointer would
  // mean a local copy that has to be reconciled with whatever the board answers.
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const current = sections[category] ?? []

  const apply = async (edit: Parameters<typeof editFormSections>[0]) => {
    setError((await editFormSections(edit)) ?? '')
  }

  /** Drops the row picked up at `from` onto `to`, and sends the whole new order. Dropping a
   *  row on itself writes nothing — a drag that ends where it started is not an edit. */
  const drop = (from: number, to: number) => {
    setDragging(null)
    setOver(null)
    if (from === to || from < 0 || to < 0 || to >= current.length) return
    const ids = current.map((section) => section.id)
    const [row] = ids.splice(from, 1)
    ids.splice(to, 0, row)
    void apply({ do: 'reorder', category, ids })
  }

  const add = () => {
    if (!normalizeFormSection(typed)) return
    void apply({ do: 'create', category, name: typed })
    setTyped('')
  }

  return (
    <Panel
      title="Form sections"
      actions={
        <>
          <Saving on={saving} />
          <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
            ❌ Close
          </button>
        </>
      }
    >
      <p className="text-xs text-muted">
        The rows the upload form draws under a category, in the order it draws them. Drag a
        row by its grip to move it. A tag is offered on one of these or not at all — which
        row it is on is set on the tag itself. A row with a condition is drawn only when the
        post satisfies it: <em>blue archive</em> when <span className="font-mono">blue_archive</span>{' '}
        is on the post, where <em>hair color</em> is always.
      </p>

      <div className="flex flex-wrap gap-2">
        {/* The category is the panel's subject, so it is the first thing in it rather than a
            heading: everything below answers this menu. Coloured closed and open, the way
            every other category menu in the app is — the colour is how a category is
            recognised on the grid, on a post and on the form's own headings. */}
        <select
          value={category}
          onChange={(event) => {
            onCategory(event.target.value)
            setError('')
          }}
          className={`${FIELD} min-w-40 ${categoryColor(category)}`}
        >
          {TAG_CATEGORIES.map((option) => (
            <option
              key={option}
              value={option}
              className={`bg-background ${categoryColor(option)}`}
            >
              {categoryLabel(option)}
            </option>
          ))}
        </select>
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
      </div>

      {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

      {current.length === 0 ? (
        <p className="text-xs text-muted">
          No rows here yet — {categoryLabel(category)} is a heading with nothing under it, and
          the tags in it are not offered at all.
        </p>
      ) : (
        // Dimmed and inert while a write is out. A reorder is one update per row and a
        // rename is a round trip, and until either lands the list on screen is what was
        // *sent* rather than what the board holds — a second drag started against it would
        // be composed on a stale order and land somewhere nobody asked for. The list is also
        // the only thing here big enough for the state to be noticed on, which is why the
        // word in the heading is not carrying this alone.
        <ul
          aria-busy={saving}
          className={`flex flex-col overflow-hidden rounded-lg border border-border transition-opacity ${
            saving ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {current.map((section, index) => (
            <li
              key={section.id}
              // Wraps once the condition is on it: a row is a grip, a number, a name and a
              // condition, and the condition is the part that grows.
              onDragOver={(event) => {
                // Without this the drop is refused: the default for a dragover is "you
                // cannot drop here".
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setOver(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging !== null) drop(dragging, index)
              }}
              // The row being dragged fades; the one under the pointer is where it would
              // land, said with an accent edge on the side it is coming from — a line
              // between two rows reads as a destination where a highlighted row reads as a
              // selection.
              className={`-mb-px flex flex-wrap items-center gap-1 border-b border-border px-2 py-1 transition-opacity ${
                dragging === index ? 'opacity-40' : ''
              } ${
                over === index && dragging !== null && dragging !== index
                  ? dragging < index
                    ? 'border-b-accent'
                    : 'border-t border-t-accent'
                  : ''
              }`}
            >
              {/* The grip is what is draggable, not the row: the row holds a text field, and
                  a `draggable` ancestor takes the pointer's selection of that text away. It
                  is also the honest answer to "what here can I pick up". */}
              <span
                draggable
                onDragStart={(event) => {
                  setDragging(index)
                  event.dataTransfer.effectAllowed = 'move'
                  // Some sources refuse to start a drag with nothing on the transfer.
                  event.dataTransfer.setData('text/plain', section.name)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                aria-hidden
                title="Drag to reorder"
                className="w-5 shrink-0 cursor-grab text-center text-xs text-muted active:cursor-grabbing"
              >
                ⠿
              </span>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">
                {index + 1}
              </span>
              <SectionName
                name={section.name}
                onRename={(name) => void apply({ do: 'rename', id: section.id, name })}
              />
              {/* What the row waits for, on the row itself: a section with a condition is a
                  row that is not always there, and that is worth reading at a glance rather
                  than by opening something. `Any`/`All` is the switch, the chips are the
                  tags, and Choose turns the grid below into the picker for them. */}
              <SectionDeps
                section={section}
                picking={picking === section.id}
                onPick={() => onPick(picking === section.id ? null : section.id)}
                onMode={(mode) =>
                  void apply({ do: 'deps', id: section.id, mode, names: section.deps })
                }
                onRemove={(name) =>
                  void apply({
                    do: 'deps',
                    id: section.id,
                    mode: section.depsMode,
                    names: section.deps.filter((dep) => dep !== name),
                  })
                }
              />
              {/* No confirmation: the tags on this row are not deleted with it. The foreign
                  key is `on delete set null`, so they go back to being on no row — which is
                  a re-file, not a loss, and the row itself is one press to make again. */}
              <button
                type="button"
                onClick={() => void apply({ do: 'delete', id: section.id })}
                aria-label={`Remove the ${section.name} row`}
                title="Remove this row — its tags go back to being on no row"
                className={`${BUTTON_ON_SURFACE} hover:text-[#ff5d5f]`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * What a section waits for: a mode, its tags, and the button that turns the grid below into
 * the picker for them.
 *
 * A section with no dependencies is always drawn in the form, which is most of them, so the
 * quiet state is one word — Always — and not an empty list of nothing. The condition
 * appears as you give it one.
 *
 * The tags are **picked from the grid**, never typed, the same gesture a tag rule and a
 * catalog are filled in with and for the same reason: a condition may only ever name tags
 * the board has, and the screen with every one of them on it is directly below.
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
    <span className="flex flex-wrap items-center gap-1">
      {section.deps.length === 0 ? (
        <span className="px-1 text-xs text-muted">Always shown</span>
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
          picking
            ? 'Stop choosing'
            : 'Click tags in the list below to say what this row waits for'
        }
        className={`${BUTTON_ON_SURFACE} ${picking ? 'bg-accent/15 font-semibold text-accent' : 'text-accent'}`}
      >
        {picking ? '✅ Done' : '👆 Choose'}
      </button>
    </span>
  )
}

/**
 * A row's name, edited in place.
 *
 * Written on blur and on Enter rather than on every keystroke: a rename is a round trip and
 * a row that renamed itself letter by letter would be a dozen writes and a dozen chances
 * for two of them to land out of order. Escape puts the stored name back, which is the way
 * out of a half-typed edit that a text field otherwise does not have.
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
      // Borderless at rest, so a list of rows reads as a list rather than as a column of
      // boxes; the border arrives on focus, which is when it is a field.
      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none hover:border-border focus:border-accent"
    />
  )
}

/**
 * The one word this panel says back, drawn always and faded rather than mounted on demand
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
      {/* A ring rather than a glyph: the emoji this app reaches for first would be spinning
          a picture of something, and what is wanted is the plainest possible "wait". Drawn
          always, so the row does not reflow the moment a drop lands. */}
      <span
        aria-hidden
        className="size-3 animate-spin rounded-full border border-accent border-t-transparent"
      />
      saving…
    </span>
  )
}
