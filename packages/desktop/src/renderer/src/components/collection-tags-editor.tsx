import { useState } from 'react'
import type { CollectionTag } from '../../../shared/api'
import { tagLabel } from '@common/search'
import { BUTTON_SUBMIT_ON_SURFACE, DANGER_ON_SURFACE } from './buttons'
import { HoldButton } from './hold-button'
import { Modal } from './modal'
import { FIELD } from './panel'

/**
 * ✏️ Edit tags: every tag on the shelf as a row of its own — mark, name, how many images carry
 * it, Save and a held delete — in a modal over the shelf.
 *
 * It was a mode on the tag bar: Edit tags on, a click on a pill picked it for a form below
 * instead of filtering the grid. Two meanings for one click, a mode to remember to leave, and
 * a form for one tag at a time. A list says what it is without being explained, edits any tag
 * in place, and leaves a pill on the bar meaning the one thing it always means.
 */
export function TagEditor({
  tags,
  onClose,
  onRenamed,
  onDeleted,
}: {
  tags: CollectionTag[]
  onClose: () => void
  /** A rename landed — the bar re-reads, and a lit pill follows its new name. */
  onRenamed: (from: string, to: string) => void
  /** A delete landed — the bar re-reads, and a lit pill for it goes out. */
  onDeleted: (name: string) => void
}) {
  return (
    <Modal title="Edit tags" onClose={onClose}>
      <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {tags.map((tag) => (
          // Keyed by name as well as id, so a row seeds itself again after its own rename.
          <TagRow
            key={`${tag.id}:${tag.name}:${tag.mark ?? ''}`}
            tag={tag}
            onRenamed={onRenamed}
            onDeleted={onDeleted}
          />
        ))}
      </ul>
    </Modal>
  )
}

function TagRow({
  tag,
  onRenamed,
  onDeleted,
}: {
  tag: CollectionTag
  onRenamed: (from: string, to: string) => void
  onDeleted: (name: string) => void
}) {
  // Seeded as it is drawn; the reader turns the spaces back into `_` on the way in.
  const [name, setName] = useState(tagLabel(tag.name))
  const [mark, setMark] = useState(tag.mark ?? '')
  const [error, setError] = useState<string | null>(null)
  const dirty = name !== tagLabel(tag.name) || mark !== (tag.mark ?? '')

  async function save() {
    if (!dirty || !name.trim()) return
    const result = await window.api.editCollectionTag(tag.id, { name, mark })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onRenamed(tag.name, result.name)
  }

  const carriers = `${tag.post_count} image${tag.post_count === 1 ? '' : 's'}`

  return (
    <li className="flex flex-col gap-1">
      {/* A form per row, so Enter saves the row being typed in and no other. */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        className="flex items-center gap-2"
      >
        <input
          value={mark}
          onChange={(event) => setMark(event.target.value)}
          aria-label={`Mark for ${tagLabel(tag.name)}`}
          placeholder="🎀"
          spellCheck={false}
          title="An emoji, a #hex or CSS colour for a dot, or a short prefix"
          className={`${FIELD} w-16 shrink-0`}
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={`Name of ${tagLabel(tag.name)}`}
          spellCheck={false}
          className={`${FIELD} min-w-0 flex-1`}
        />
        <span className="w-16 shrink-0 text-right text-xs text-muted">{carriers}</span>
        <button
          type="submit"
          disabled={!dirty || !name.trim()}
          className={BUTTON_SUBMIT_ON_SURFACE}
        >
          Save
        </button>
        {/* Held, because it takes the tag off every image carrying it and nothing puts it
            back. The images themselves stay. */}
        <HoldButton
          ms={1500}
          fill="bg-[#ff5d5f]/30"
          title={`Hold to delete — ${carriers} ${tag.post_count === 1 ? 'carries' : 'carry'} it`}
          onHold={() => {
            void window.api.deleteCollectionTag(tag.id).then((result) => {
              if (!result.ok) setError(result.error)
              else onDeleted(tag.name)
            })
          }}
          className={DANGER_ON_SURFACE}
        >
          <span aria-hidden>🗑️</span>
          <span className="sr-only">Hold to delete {tagLabel(tag.name)}</span>
        </HoldButton>
      </form>
      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
    </li>
  )
}
