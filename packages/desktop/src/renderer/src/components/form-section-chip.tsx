import { categoryColor, type Tag } from '@common/tags'
import { tagLabel } from '@common/search'
import { TagMark } from './tag-mark'

/**
 * One tag, drawn as it is everywhere else — its mark, its name, its category's colour — and
 * draggable, which is the gesture this screen is built on.
 *
 * While a card is asking for its dependencies it is a button instead, and says whether it is
 * in the condition. The same two meanings the Tags grid has, for the same reason: there is
 * one list of every tag on the screen, and a pick has to be answered from it.
 */
export function TagChip({
  tag,
  onSurface = false,
  picking,
  blocked = false,
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
  /**
   * This tag is on the row doing the asking, so it is not an answer it could ever take —
   * a row that waits for its own tag is a row nothing can open. Drawn faded and inert for
   * as long as the pick lasts, which says "not this one" where an error after the click
   * would only say it afterwards.
   */
  blocked?: boolean
  chosen: boolean
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const inert = picking && blocked

  return (
    <button
      type="button"
      disabled={inert}
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
        inert
          ? `${tagLabel(tag.name)} is on this row — a row cannot wait for a tag it offers`
          : picking
            ? chosen
              ? `Stop this row waiting for ${tagLabel(tag.name)}`
              : `Wait for ${tagLabel(tag.name)}`
            : `Drag ${tagLabel(tag.name)} onto a row`
      }
      className={`flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs transition-colors ${
        picking ? '' : 'cursor-grab active:cursor-grabbing'
      } ${inert ? 'opacity-40' : ''} ${
        chosen && picking
          ? 'border-accent bg-accent/10'
          : `border-border ${onSurface ? 'bg-background' : 'bg-surface'} ${
              inert ? '' : 'hover:border-accent'
            }`
      } ${categoryColor(tag.category)}`}
    >
      <TagMark mark={tag.mark} />
      {tagLabel(tag.name)}
      {picking && !inert && (
        <span aria-hidden className={chosen ? 'text-accent' : 'text-muted'}>
          {chosen ? '✓' : '＋'}
        </span>
      )}
    </button>
  )
}
