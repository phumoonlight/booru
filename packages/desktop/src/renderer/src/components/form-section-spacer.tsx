import { useState } from 'react'
import { BUTTON_ON_SURFACE } from './buttons'

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
export function SpacerCard({
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
  // Asked here too, and for the plainer half of the reason a row's is: the ✕ is a few pixels
  // from the grip, and a gap is the one card whose whole worth is *where it is* — put back,
  // it lands on the shorter column rather than where it was taken from.
  const [confirming, setConfirming] = useState(false)

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
      {confirming ? (
        <>
          <span className="flex-1 text-xs text-muted">Remove this space?</span>
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              onDelete()
            }}
            className="min-h-8 rounded-lg bg-[#ff5d5f] px-3 text-xs font-semibold text-[#0d0f14] transition-opacity hover:opacity-90"
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
        </>
      ) : (
        <>
          <span className="flex-1 text-xs uppercase tracking-wide text-muted">Space</span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Remove this space"
            title="Remove this space"
            className={`${BUTTON_ON_SURFACE} hover:text-[#ff5d5f]`}
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}
