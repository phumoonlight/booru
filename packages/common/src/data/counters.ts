import type { BooruClient } from '@common/supabase/types'

/**
 * The one denormalized counter left — `tags.post_count`.
 *
 * These rode on Postgres triggers until they were moved here. Two things changed with
 * the move to TypeScript. The counters are now recomputed rather than incremented,
 * because PostgREST has no `set post_count = post_count + 1` and the read-then-write
 * that stands in for it can lose a concurrent update — permanently, since an
 * increment has no way of noticing it is behind. A recount reads the rows that
 * define the number and stores the answer, so it is right regardless of what it
 * finds, and a stale write is corrected by the next one.
 *
 * And they never throw. A counter is derived data: by the time it is recomputed the
 * post write has already succeeded, and failing the upload afterwards would trade a
 * wrong number for a lost image. A failed sync is logged and left for the next write
 * that touches the same tag — which, because this recounts rather than increments,
 * repairs it outright.
 *
 * The client is passed in rather than built here so `packages/desktop` can share this
 * file; the web's `createAdminClient()` is `server-only`. It has to be a service-role
 * client: no table in this schema has a write policy any more, so the anon key the
 * website holds cannot move this number and is not meant to be able to.
 */

/** Recount `tags.post_count` from `post_tags` for exactly these tags. */
export async function syncTagPostCounts(client: BooruClient, tagIds: number[]): Promise<void> {
  const ids = [...new Set(tagIds)]
  if (ids.length === 0) return

  // Independent single-row writes, so they go out together rather than one at a time —
  // a 20-tag upload would otherwise pay 20 sequential round trips for bookkeeping.
  await Promise.all(
    ids.map(async (tagId) => {
      const { count, error } = await client
        .from('post_tags')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', tagId)
      if (error) {
        console.error(`Could not count posts for tag ${tagId}:`, error.message)
        return
      }

      const { error: writeError } = await client
        .from('tags')
        .update({ post_count: count ?? 0 })
        .eq('id', tagId)
      if (writeError) {
        console.error(`Could not store post_count for tag ${tagId}:`, writeError.message)
      }
    })
  )
}
