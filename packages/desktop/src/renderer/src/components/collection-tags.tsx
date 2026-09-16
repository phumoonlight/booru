import { useCallback, useEffect, useState } from 'react'
import type { CollectionTag } from '../../../shared/api'
import {
  BUTTON_ON_SURFACE,
  BUTTON_SUBMIT_ON_SURFACE,
  DANGER_ON_SURFACE,
  buttonToggle,
  tagPill,
} from './buttons'
import { HoldButton } from './hold-button'
import { FIELD } from './panel'
import { TagMark } from './tag-mark'
import { tagLabel } from '@common/search'

/**
 * A shelf's own tags, above its images: a pill each, lit while it narrows the grid, and the
 * two ways the set of them changes — ➕ New tag and ✏️ Edit tags.
 *
 * **A click on a pill means one thing per mode**, the way a click on a tile does in 🗂️
 * Manage. Normally it lights the pill, and lit pills combine — two lit is the images carrying
 * both. With ✏️ Edit tags on, it picks that pill for a rename or a delete instead, since a
 * filter that flickers on and off while you are trying to rename something is two gestures
 * answering one click.
 *
 * A tag is made here and nowhere else. The image panel and the manage bar put a tag that
 * already exists on images; neither can coin one.
 */
export function TagBar({
  collectionId,
  tags,
  active,
  onToggle,
  onChanged,
  onRenamed,
}: {
  collectionId: number
  tags: CollectionTag[]
  active: string[]
  onToggle: (name: string) => void
  /** Anything that changes the set of tags — a new one, a delete. */
  onChanged: () => void
  /** A rename, so a lit pill stays lit under its new name. */
  onRenamed: (from: string, to: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<CollectionTag | null>(null)
  const [draft, setDraft] = useState('')
  const [mark, setMark] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function create() {
    const result = await window.api.createCollectionTag(collectionId, { name: draft, mark })
    if (!result.ok) {
      setError(result.error)
      return
    }
    // The mark is kept: tags made together are usually one kind of thing wearing one mark.
    setDraft('')
    setError(null)
    onChanged()
  }

  async function rename() {
    if (!picked) return
    if (draft === tagLabel(picked.name) && mark === (picked.mark ?? '')) {
      setPicked(null)
      return
    }
    const result = await window.api.editCollectionTag(picked.id, { name: draft, mark })
    if (!result.ok) {
      setError(result.error)
      return
    }
    onRenamed(picked.name, result.name)
    setPicked(null)
    setError(null)
    onChanged()
  }

  function pick(tag: CollectionTag) {
    setPicked(tag)
    // Seeded as it is drawn; the reader turns the spaces back into `_` on the way in.
    setDraft(tagLabel(tag.name))
    setMark(tag.mark ?? '')
    setError(null)
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && !creating && (
          <span className="px-1 text-xs text-muted">No tags on this collection.</span>
        )}
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => (editing ? pick(tag) : onToggle(tag.name))}
            aria-pressed={editing ? picked?.id === tag.id : active.includes(tag.name)}
            className={tagPill(!editing && active.includes(tag.name), picked?.id === tag.id)}
          >
            <TagMark mark={tag.mark} />
            {tagLabel(tag.name)}
            <span className="text-xs opacity-70">{tag.post_count}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => {
              setCreating((was) => !was)
              setPicked(null)
              setDraft('')
              setMark('')
              setError(null)
            }}
            aria-pressed={creating}
            className={buttonToggle(creating)}
          >
            <span aria-hidden>➕</span> New tag
          </button>
          {tags.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEditing((was) => !was)
                setPicked(null)
                setCreating(false)
                setError(null)
              }}
              aria-pressed={editing}
              className={buttonToggle(editing)}
            >
              <span aria-hidden>✏️</span> Edit tags
            </button>
          )}
        </div>
      </div>

      {(creating || picked) && (
        // A form, so the return key finishes it — a tag is typed, and reaching for the mouse
        // after every one is the slow part of making several.
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void (picked ? rename() : create())
          }}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <label className="flex items-center gap-2 text-xs text-muted">
            Mark
            <input
              value={mark}
              onChange={(event) => setMark(event.target.value)}
              placeholder="🎀"
              spellCheck={false}
              title="An emoji, a #hex or CSS colour for a dot, or a short prefix"
              className={`${FIELD} w-24 bg-background`}
            />
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
            {picked ? `Edit ${tagLabel(picked.name)}` : 'New tag'}
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="blue hair"
              spellCheck={false}
              className={`${FIELD} min-w-0 flex-1 bg-background`}
            />
          </label>
          <button type="submit" disabled={!draft.trim()} className={BUTTON_SUBMIT_ON_SURFACE}>
            <span aria-hidden>✅</span> {picked ? 'Save' : 'Create'}
          </button>
          {picked && (
            // Held, because it takes the tag off every image carrying it and nothing puts
            // it back. The images themselves stay.
            <HoldButton
              ms={1500}
              fill="bg-[#ff5d5f]/30"
              title={`Hold to delete — ${picked.post_count} image${picked.post_count === 1 ? ' carries' : 's carry'} it`}
              onHold={() => {
                const gone = picked
                void window.api.deleteCollectionTag(gone.id).then((result) => {
                  if (!result.ok) {
                    setError(result.error)
                    return
                  }
                  if (active.includes(gone.name)) onToggle(gone.name)
                  setPicked(null)
                  onChanged()
                })
              }}
              className={DANGER_ON_SURFACE}
            >
              <span aria-hidden>🗑️</span> Hold to delete
            </HoldButton>
          )}
          <button
            type="button"
            onClick={() => {
              setPicked(null)
              setCreating(false)
              setError(null)
            }}
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>✕</span> {picked ? 'Cancel' : 'Done'}
          </button>
          {error && <p className="basis-full text-xs text-[#ff5d5f]">{error}</p>}
        </form>
      )}
    </section>
  )
}

/**
 * The shelf's tags as the screen holds them: the list with its counts, which pills are lit,
 * and a way to read the list again.
 *
 * Read apart from the images, since a tag put on an image changes a count and not the page,
 * and a lit pill changes the page and not the counts. Nothing empties the lit pills when the
 * shelf changes because nothing has to: `Collections` keys the screen on the open shelf, so
 * another shelf is a fresh mount.
 */
export function useShelfTags(collectionId: number) {
  const [tags, setTags] = useState<CollectionTag[]>([])
  const [nonce, setNonce] = useState(0)
  const [active, setActive] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    void window.api.listCollectionTags(collectionId).then((rows) => {
      if (alive) setTags(rows)
    })
    return () => {
      alive = false
    }
  }, [collectionId, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { tags, active, setActive, reload }
}
