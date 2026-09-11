import { BOARD, type Board } from '@common/board'
import type { Db } from '@common/db'

/**
 * The one denormalized counter left — `tags.post_count`.
 *
 * These rode on Postgres triggers, then on a fan-out of TypeScript reads and writes, and
 * are one statement now. Two things about them have never changed and are the reason
 * this file exists at all.
 *
 * They **recompute** rather than increment. An increment that loses a race is wrong for
 * good, since it has no way of noticing it is behind; a recount reads the rows that
 * define the number and stores the answer, so it is right regardless of what it finds
 * and a stale write is corrected by the next one that touches the same tag.
 *
 * And they **never throw**. A counter is derived data: by the time it is recomputed the
 * post write has already landed, and failing the upload afterwards would trade a wrong
 * number for a lost image. A failed sync is logged and left for the next write to
 * repair — which, because this recounts, it does outright.
 *
 * The client is passed in rather than built here so `packages/desktop` can share this
 * file (invariant 3).
 */

/**
 * Recount this board's count column from this board's link table, for exactly these tags.
 *
 * **Two counts, one statement.** A tag is shared by both boards and counted separately on
 * each (see `db/migrations/0005_generative_posts.sql`): four hundred generated posts and
 * two drawn ones is not a tag with four hundred and two posts on the gallery in front of
 * you. Which pair of names to use is the board's, out of `@common/board`, so the column
 * and the table it is recounted from can never be picked from different boards.
 *
 * Both identifiers are interpolated with `db(...)`, which escapes them as identifiers
 * rather than sending them as values — and both come from a frozen lookup, not from
 * anything typed in.
 */
export async function syncTagPostCounts(
  db: Db,
  tagIds: number[],
  board: Board = 'post'
): Promise<void> {
  const ids = [...new Set(tagIds)]
  if (ids.length === 0) return

  const { postTags, tagCount } = BOARD[board]

  try {
    // One statement for the whole set. It was a `Promise.all` of two round trips per tag
    // — a count, then an update — because PostgREST cannot express a correlated
    // subquery, so a twenty-tag upload spent forty requests on bookkeeping. The
    // arithmetic is identical; what changed is that the database does it, and does it
    // atomically per row rather than read-then-write.
    await db`
      update tags t
         set ${db(tagCount)} = (select count(*) from ${db(postTags)} pt where pt.tag_id = t.id)
       where t.id = any(${ids})`
  } catch (error) {
    console.error(
      `Could not recount ${tagCount} for tags ${ids.join(', ')}:`,
      error instanceof Error ? error.message : error
    )
  }
}
