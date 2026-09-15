import { categoryColor, type Tag, type TagCategory } from '@common/tags'
import { tagLabel } from '@common/search'
import { TagMark } from './tag-mark'

/**
 * One block of tags: the whole of one category.
 *
 * Ruled like a table: each cell carries its own right/bottom rule and is pulled a pixel
 * over its neighbour so shared edges stay hairlines.
 */
export function TagGrid({
  tags,
  category,
  editingId,
  onSelect,
}: {
  tags: Tag[]
  category: TagCategory
  editingId: number | null
  onSelect: (tag: Tag) => void
}) {
  return (
    <ul className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-4">
      {tags.map((tag) => (
        <li key={tag.id} className="-mb-px -mr-px border-b border-r border-border">
          <button
            type="button"
            onClick={() => onSelect(tag)}
            title={`Manage ${tagLabel(tag.name)}`}
            className={`flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface ${
              editingId === tag.id ? 'bg-surface' : ''
            } ${categoryColor(category)}`}
          >
            {/* Ahead of the name and outside the truncation, so a long tag loses its own
                tail rather than the mark that identifies it fastest. */}
            <TagMark mark={tag.mark} />
            <span className="min-w-0 flex-1 truncate">{tagLabel(tag.name)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
