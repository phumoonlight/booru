import { useCallback, useEffect, useState } from 'react'
import type { CollectionTag } from '../../../shared/api'
import { BUTTON_SUBMIT_ON_SURFACE, buttonToggle, tagPill } from './buttons'
import { FIELD } from './panel'
import { Modal } from './modal'
import { TagMark } from './tag-mark'
import { TagEditor } from './collection-tags-editor'
import { tagLabel } from '@common/search'

/**
 * A shelf's own tags, above its images: a pill each, lit while it narrows the grid, and the
 * two ways the set of them changes — ➕ New tag and ✏️ Edit tags, both modals, the second a
 * list of every tag to rename, re-mark or delete (`TagEditor`).
 *
 * **A click on a pill always means one thing**: light it, and lit pills combine — two lit is
 * the images carrying both. It used to mean "pick this for editing" while ✏️ Edit tags was on,
 * which is a mode to remember and a click that answers two questions.
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
  const closeCreating = useCallback(() => setCreating(false), [])
  const [editing, setEditing] = useState(false)
  const closeEditing = useCallback(() => setEditing(false), [])
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

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && (
          <span className="px-1 text-xs text-muted">No tags on this collection.</span>
        )}
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.name)}
            aria-pressed={active.includes(tag.name)}
            className={tagPill(active.includes(tag.name))}
          >
            <TagMark mark={tag.mark} />
            {tagLabel(tag.name)}
            <span className="text-xs opacity-70">{tag.post_count}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setCreating((was) => !was)
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
                setEditing(true)
                setCreating(false)
              }}
              className={buttonToggle(false)}
            >
              <span aria-hidden>✏️</span> Edit tags
            </button>
          )}
        </div>
      </div>

      {creating && (
        // A form, so the return key finishes it — a tag is typed, and reaching for the mouse
        // after every one is the slow part of making several.
        // A modal like Edit tags and New collection. It stays open after Create — tags are
        // usually made several at once — with the name cleared and the mark kept.
        <Modal title="New tag" onClose={closeCreating}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex gap-2">
              <label className="flex w-20 shrink-0 flex-col gap-1 text-xs text-muted">
                Mark
                <input
                  value={mark}
                  onChange={(event) => setMark(event.target.value)}
                  placeholder="🎀"
                  spellCheck={false}
                  title="An emoji, a #hex or CSS colour for a dot, or a short prefix"
                  className={`${FIELD} w-full text-foreground`}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                Name
                <input
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="blue hair"
                  spellCheck={false}
                  className={`${FIELD} w-full text-foreground`}
                />
              </label>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3">
              {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
              <button
                type="submit"
                disabled={!draft.trim()}
                className={`${BUTTON_SUBMIT_ON_SURFACE} ml-auto`}
              >
                <span aria-hidden>✅</span> Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <TagEditor
          tags={tags}
          onClose={closeEditing}
          onRenamed={(from, to) => {
            onRenamed(from, to)
            onChanged()
          }}
          onDeleted={(name) => {
            if (active.includes(name)) onToggle(name)
            onChanged()
          }}
        />
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
