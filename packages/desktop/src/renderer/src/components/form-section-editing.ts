import { useState } from 'react'
import { editFormSections, useFormSections, useFormSectionsSaving } from '../form-sections'
import type { FormSectionEdit } from '@common/data/form-sections'
import type { Tag } from '@common/tags'

/**
 * Everything the Sections screen *does*, apart from drawing: the board's rows, the writes
 * that move them, and the one thing this screen holds over the top of what the board said.
 *
 * Split out from the view because the two are different in kind — one is a page of cards
 * and drop targets, the other is four writes and the optimism that makes them feel
 * immediate — and because the view had grown past the point where either could be read
 * without the other in the way.
 */
export function useSectionEditing() {
  const sections = useFormSections()
  const saving = useFormSectionsSaving()
  const [error, setError] = useState('')
  /**
   * Where a tag has been moved this session, over the top of what the board said.
   *
   * The write goes out on the drop and this is what the screen draws until the way out.
   * Re-reading the whole index after every drop would be a query per tag filed, and filing
   * is done in runs of twenty. A write that fails takes its entry back out, so the chip
   * returns to where it came from rather than sitting somewhere the board disagrees with.
   */
  const [moved, setMoved] = useState<Map<number, number | null>>(new Map())

  const apply = async (edit: FormSectionEdit) => {
    setError((await editFormSections(edit)) ?? '')
  }

  /** Which row a tag is on, this screen's moves included. */
  const sectionOf = (tag: Tag): number | null =>
    moved.has(tag.id) ? (moved.get(tag.id) ?? null) : (tag.form_section_id ?? null)

  /**
   * Files one tag onto one row.
   *
   * Optimistic, and put back if the write is refused: the chip has left the pointer by the
   * time the board answers, and a card drawn holding a tag it does not hold is a screen you
   * would go on filing against.
   */
  async function file(tagId: number, sectionId: number) {
    const had = moved.has(tagId)
    const before = moved.get(tagId) ?? null
    setMoved((current) => new Map(current).set(tagId, sectionId))
    setError('')

    const result = await window.api.setTagFormSection(tagId, sectionId)
    if (!result.ok) {
      setMoved((current) => {
        const next = new Map(current)
        if (had) next.set(tagId, before)
        else next.delete(tagId)
        return next
      })
      setError(result.error)
    }
  }

  /**
   * Moves one row into a place: in front of another card, behind it, or onto the end of a
   * column when it was dropped in the space below the last one.
   *
   * Written as both columns at once, which is what makes it exact. A row's side is a column
   * of its own on the board now (`0004_section_sides.sql`); it was the parity of a single
   * flat position, and every awkwardness this gesture had came from that. A flat list has no
   * way to say that one column holds one more than the other, so a row moved across the
   * divider came back on the wrong side of it, and the only crossing that worked at all was
   * a trade with a row already there — which left the foot of the shorter column
   * unreachable. There is nothing to work around now: a row goes where it was dropped, the
   * column it left closes up, and no other row moves.
   */
  const place = (id: number, side: number, target: number | null, after: boolean) => {
    const columns: [number[], number[]] = [
      sections.filter((row) => row.side !== 1).map((row) => row.id),
      sections.filter((row) => row.side === 1).map((row) => row.id),
    ]

    const from = sections.find((row) => row.id === id)
    if (!from) return

    const source = columns[from.side === 1 ? 1 : 0]
    source.splice(source.indexOf(id), 1)

    const into = columns[side === 1 ? 1 : 0]
    // Read after the source column has closed up, which is what makes a move down inside one
    // column land where it looks like it will: `indexOf` is one less than it was, and the
    // `after` the drop already decided is added to that rather than to a stale index.
    const at = target === null ? into.length : into.indexOf(target) + (after ? 1 : 0)
    if (at < 0) return
    into.splice(at, 0, id)

    void apply({ do: 'reorder', columns })
  }

  return { sections, saving, error, setError, moved, sectionOf, apply, file, place }
}
