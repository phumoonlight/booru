import { useState } from 'react'
import { normalizeFormSection, type Tag } from '@common/tags'
import { BUTTON_ON_SURFACE } from './buttons'
import { TagChip } from './form-section-chip'
import type { DepsMode, FormSection } from '@common/data/form-sections'

/**
 * One row of the form, as a card: what it is called, what it waits for, and what is on it.
 *
 * The card *is* the drop target, all of it — a tag let go anywhere on it lands on this row.
 * A card that only accepted a drop over its chips would be a target that shrinks as the row
 * empties, which is exactly backwards: an empty row is the one you are aiming at.
 */
export function SectionCard({
  section,
  index,
  tags,
  over,
  picking,
  choosing,
  showTags,
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
  /** Everything on this row. There is no filter on this screen, so it is also the count. */
  tags: Tag[]
  /**
   * What letting go here would do, or null for nothing. A tag lands *on* this card, so the
   * card lights up; another card lands in the gap above or below it, so the gap does — a
   * line between two cards reads as a destination where a lit card reads as a thing being
   * landed on, which is the difference between the two kinds of drop and worth knowing
   * before letting go.
   */
  over: 'tag' | 'above' | 'below' | null
  /** This row is the one asking for its condition — the ✅ Done state of its own button. */
  picking: boolean
  /**
   * *Some* row is asking, which is what a chip needs to know. It is not the same question:
   * a pick is answered from every tag on the screen, not from the card that opened it, so a
   * chip drawn as an ordinary draggable name while another card was waiting for an answer
   * toggled that card's condition on a click that looked like nothing at all — and a tag
   * already in the condition was highlighted on one card out of every card holding it.
   */
  choosing: boolean
  /** Whether the condition and the chips are drawn at all — see `detail`. */
  showTags: boolean
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
  // Asked before a row goes, even though nothing on it is lost with it. What it costs is
  // still a thing you built — a name, a condition, a place in a column, and a set of tags
  // filed one drag at a time — and the ✕ that takes it sits a few pixels from the grip that
  // is pressed every time a row is moved. Card-local, so two rows cannot both be asking.
  const [confirming, setConfirming] = useState(false)

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
      <div
        className={`flex items-center gap-1 px-1 py-1 ${
          showTags || confirming ? 'border-b border-border' : ''
        }`}
      >
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
        <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted">{index + 1}</span>
        <SectionName name={section.name} onRename={onRename} />
        {/* Compact draws no condition, and a row that comes and goes is not a thing to learn
            by opening the card back up. One glyph and its count says there is one; what it
            is remains the detailed view's answer. */}
        {!showTags && section.deps.length > 0 && (
          <span
            title={`Shown when ${section.depsMode === 'any' ? 'any one' : 'all'} of ${section.deps.join(', ')} ${section.depsMode === 'any' ? 'is' : 'are'} on the post`}
            className="shrink-0 text-xs text-muted"
          >
            <span aria-hidden>👁</span> {section.deps.length}
          </span>
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted">{tags.length}</span>
        <button
          type="button"
          onClick={() => setConfirming(!confirming)}
          aria-label={`Remove the ${section.name} row`}
          aria-pressed={confirming}
          title="Remove this row — its tags go back to being on no row"
          className={`${BUTTON_ON_SURFACE} ${
            confirming ? 'text-[#ff5d5f]' : 'hover:text-[#ff5d5f]'
          }`}
        >
          ✕
        </button>
      </div>

      {/* Said out loud rather than done on the press, and said in full: what a row's ✕ costs
          is not obvious either way round. Nothing on it is deleted — the foreign key is
          `on delete set null`, so its tags go back to being on no row and reappear in the
          strip at the top — but they stop being offered anywhere in the form until each one
          is filed again, which on a row of twenty is the afternoon this screen exists to
          save. The way out sits where the hand was already going. */}
      {confirming && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ff5d5f] bg-[#ff5d5f]/5 p-2 text-xs">
          <span className="text-muted">
            Remove “{section.name}”?{' '}
            {tags.length === 0
              ? 'Nothing is on it.'
              : `Its ${tags.length} tag${tags.length === 1 ? '' : 's'} go back to being on no row, and stop being offered until ${tags.length === 1 ? 'it is' : 'they are'} filed again.`}
          </span>
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              onDelete()
            }}
            className="ml-auto min-h-8 rounded-lg bg-[#ff5d5f] px-3 text-xs font-semibold text-[#0d0f14] transition-opacity hover:opacity-90"
          >
            Remove it
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-8 rounded-lg border border-border px-3 text-xs transition-colors hover:bg-background"
          >
            Keep it
          </button>
        </div>
      )}

      {/* Compact stops here: a name, its number and what it holds. The condition and the
          chips are the rest of the card, and the rest of its height. */}
      {showTags && (
        <>
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
                picking={choosing}
                // Its own tags are not answers to its own condition.
                blocked={picking}
                chosen={depNames.has(tag.name)}
                onClick={() => onClickTag(tag)}
                onDragStart={() => onDragTag(tag.id)}
                onDragEnd={onDragEnd}
              />
            ))}
            {tags.length === 0 && <p className="px-1 py-2 text-xs text-muted">Drag a tag here.</p>}
          </div>
        </>
      )}
    </div>
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
 * The tags are **picked, never typed**, for the reason a tag rule's are searched rather
 * than typed: a condition may only ever name tags the board has, and every one of them is
 * on the screen already.
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
        if (event.key === 'Escape') {
          // The view's own Escape is on `window`, so without this the key that abandons a
          // half-typed rename also closes the screen behind it.
          event.stopPropagation()
          setDraft(null)
        }
      }}
      aria-label={`Rename ${name}`}
      spellCheck={false}
      // Borderless at rest, so a grid of cards reads as cards rather than as boxes inside
      // boxes; the border arrives on focus, which is when it is a field.
      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-sm font-semibold outline-none hover:border-border focus:border-accent"
    />
  )
}
