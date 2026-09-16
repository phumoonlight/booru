import { useState } from 'react'
import type { CollectionTag } from '../../../shared/api'
import { tagPill } from './buttons'
import { TagMark } from './tag-mark'
import { tagLabel } from '@common/search'

/**
 * The shelf's tags on one image's panel, each lit if the image carries it — a click puts it
 * on or takes it off, written at once.
 *
 * Every tag the shelf has is drawn rather than only the ones on the image, because this is
 * where a tag is put on, and a list of what is already there has nothing to press.
 */
export function ImageTags({
  postId,
  tags,
  carried,
  onChanged,
}: {
  postId: number
  tags: CollectionTag[]
  /** The ids on this image, as last read. Held by the panel so a press can light at once. */
  carried: number[]
  onChanged: (carried: number[]) => void
}) {
  const [error, setError] = useState<string | null>(null)

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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        Tags
        {tags.length === 0 ? (
          <span>— none on this collection yet; ➕ New tag above the grid makes one.</span>
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
