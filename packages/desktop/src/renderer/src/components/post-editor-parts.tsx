import { useState } from 'react'

/**
 * The controls around the picture: the two arrows, the number between them, the source
 * box and the panel that takes a post away.
 *
 * Each is a small thing with its own rule about when it writes — the arrows never, the
 * number on Enter, the box on blur, the panel on a second press — and none of them is
 * about the post's tags or its rating, which is what the editor itself is.
 */

/** One step through the grid. Null means there is nothing that way, which is a reason
 *  to be on screen and unpressable rather than to be absent. */
export function NavButton({
  label,
  glyph,
  onClick,
}: {
  label: string
  glyph: string
  onClick: (() => void) | null
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.()}
      disabled={onClick === null}
      title={label}
      aria-label={label}
      // Drawn like every other button in the window — no box, a ground on hover — but
      // square, since it is a glyph with no words beside it. The old ‹ › were typographic
      // characters in the text colour and read as punctuation next to the heading.
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm transition-colors hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span aria-hidden>{glyph}</span>
    </button>
  )
}

/**
 * The heading, and a way to reach a post by its number.
 *
 * It reads as the title until it is clicked, at which point it is the box it always was —
 * no border at rest, so the screen is not asking to be typed in. Reaching a post by id is
 * the thing this window is most often opened for (you have the number from an upload,
 * from the board, from a report), and doing it meant going Back, clearing the search,
 * typing the number, pressing Search and clicking the one result.
 *
 * Enter commits, Escape puts the current number back, and blur does neither — a number
 * half-typed and then clicked away from is not a request to go anywhere. Nothing is
 * validated beyond "a positive integer": whether that post exists is the editor's own
 * question, and it already answers it with "not on the board any more".
 */
export function PostNumber({ id, onJump }: { id: number; onJump: ((id: number) => void) | null }) {
  const [typed, setTyped] = useState('')
  const editing = typed !== ''

  if (!onJump) return <h1 className="text-lg font-bold tracking-tight">Post #{id}</h1>

  const go = () => {
    const next = Number(typed.replace(/^#/, '').trim())
    setTyped('')
    if (Number.isSafeInteger(next) && next > 0 && next !== id) onJump(next)
  }

  return (
    <h1 className="flex items-center text-lg font-bold tracking-tight">
      <label htmlFor="post-number">Post&nbsp;#</label>
      <input
        id="post-number"
        value={editing ? typed : String(id)}
        onChange={(event) => setTyped(event.target.value || ' ')}
        onFocus={(event) => {
          setTyped(String(id))
          event.target.select()
        }}
        onBlur={() => setTyped('')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            go()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setTyped('')
            event.currentTarget.blur()
          }
        }}
        title="Type a post number and press Enter"
        aria-label="Post number — type another and press Enter to open it"
        spellCheck={false}
        // Sized to the digits it holds so the heading does not reserve a gap after it,
        // and `field-sizing` is what keeps that true for a five-digit board without
        // measuring anything.
        //
        // Focused, it grows an underline rather than a ring. A box drawn round the number
        // makes the heading look like a form the moment it is clicked, and this is a
        // heading that happens to be typeable — a rule under the digits says "this text
        // is the field" without turning the title row into one. The border is there at
        // rest in `transparent`, so focusing shifts nothing.
        className="w-14 [field-sizing:content] border-b border-transparent bg-transparent px-1 outline-none focus:border-accent"
      />
    </h1>
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The source, read until it is clicked. It is a URL looked at far more often than it is
 * changed, and a box is the wrong resting state for a value like that: an input invites a
 * cursor, and this one is an address you mostly want to read — or follow, which is the
 * Open beside the label.
 */
export function SourceField({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function done() {
    setEditing(false)
    if (draft.trim() !== value) onCommit(draft.trim())
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Source</span>
          {/* Beside the label rather than on the URL itself: the URL is the button that
              starts an edit, and one control cannot both open a page and put a cursor in
              it. Absent with no source, since there is nothing to open. */}
          {value && (
            <button
              type="button"
              onClick={() => void window.api.openExternal(value)}
              title="Open the source in your browser"
              className="text-xs text-muted transition-colors hover:text-foreground"
            >
              🔗 Open
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          title="Click to edit"
          className="min-h-9 w-full truncate rounded-lg border border-transparent px-3 py-1.5 text-left text-sm transition-colors hover:border-border"
        >
          {value ? (
            <span className="text-accent">{value}</span>
          ) : (
            <span className="text-muted">No source — click to add one</span>
          )}
        </button>
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Source</span>
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={done}
        onKeyDown={(event) => {
          if (event.key === 'Enter') done()
          // Escape abandons the edit — the way back out of a URL half-pasted
          if (event.key === 'Escape') setEditing(false)
        }}
        placeholder="https://…"
        spellCheck={false}
        className="min-h-9 rounded-lg border border-accent bg-surface px-3 text-sm outline-none"
      />
    </label>
  )
}

/**
 * Delete, drawn as what it is. It removes the row and both stored images with no undo, on
 * a screen where every other control writes on a single click — so it asks, in a panel
 * that says exactly what goes, and the button that does it is filled rather than outlined
 * and sits where the hand was not already travelling.
 */
export function DeletePanel({
  postId,
  busy,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  postId: number
  busy: boolean
  confirming: boolean
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!confirming) {
    return (
      <div className="flex justify-end border-t border-border pt-3">
        <button
          type="button"
          onClick={onAsk}
          className="min-h-9 px-2 text-sm text-muted transition-colors hover:text-[#ff5d5f]"
        >
          Delete
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-[#ff5d5f] bg-[#ff5d5f]/5 p-4">
      <div>
        <h2 className="text-sm font-bold text-[#ff5d5f]">⚠ Delete post #{postId} for good</h2>
        <p className="mt-1 text-sm text-muted">
          The row, the stored image and its thumbnail are all removed from the board, and every link
          to this post stops working. <strong className="text-foreground">There is no undo</strong>{' '}
          and nothing else holds a copy.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-9 rounded-lg bg-[#ff5d5f] px-4 text-sm font-semibold text-[#0d0f14] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-surface"
        >
          Keep it
        </button>
      </div>
    </div>
  )
}
