import { useState } from 'react'
import type { CollectionTag } from '../../../shared/api'
import { tagPill } from './buttons'
import { TagMark } from './tag-mark'
import { tagLabel } from '@common/search'

/**
 * The shelf's tags on one image's panel.
 *
 * **Read, only the ones the image carries**, as plain pills: a row of every tag the shelf
 * has, most of them unlit, buried the two or three that are actually on it. **While the
 * panel is being edited (✏️ Edit), every tag the shelf has**, each lit if carried — a click
 * puts it on or takes it off, written at once — because this is where a tag is put on, and a
 * list of what is already there has nothing to press.
 */
export function ImageTags({
  postId,
  tags,
  carried,
  editing,
  onChanged,
}: {
  postId: number
  tags: CollectionTag[]
  /** The ids on this image, as last read. Held by the panel so a press can light at once. */
  carried: number[]
  editing: boolean
  onChanged: (carried: number[]) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const carriedTags = tags.filter((tag) => carried.includes(tag.id))

  async function toggle(tag: CollectionTag) {
    const on = !carried.includes(tag.id)
    const result = await window.api.tagCollectionPosts({ tagId: tag.id, postIds: [postId], on })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onChanged(on ? [...carried, tag.id] : carried.filter((id) => id !== tag.id))
  }

  return (
    // The pills alone: the panel draws the "Tags" label in its own column, so wrapped rows
    // line up under the first one rather than under the word.
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {tags.length === 0 ? (
          <span className="pt-2">None on this collection yet — ➕ New tag above the grid.</span>
        ) : !editing ? (
          carriedTags.length === 0 ? (
            <span className="pt-2">None — ✏️ Edit to add some.</span>
          ) : (
            carriedTags.map((tag) => (
              // A pill's shape without its hover: read, there is nothing to press.
              <span
                key={tag.id}
                className="flex min-h-8 shrink-0 items-center gap-1.5 border border-border px-3 text-sm text-foreground"
              >
                <TagMark mark={tag.mark} />
                {tagLabel(tag.name)}
              </span>
            ))
          )
        ) : (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => void toggle(tag)}
              aria-pressed={carried.includes(tag.id)}
              className={tagPill(carried.includes(tag.id))}
            >
              <TagMark mark={tag.mark} />
              {tagLabel(tag.name)}
            </button>
          ))
        )}
      </div>
      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
    </div>
  )
}
