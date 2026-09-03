import type { BooruClient } from '@common/supabase/types'

/**
 * The denormalized counters — `tags.post_count` and `rating_counts.post_count`.
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
 * that touches the same tag or rating — which, because these recount rather than
 * increment, repairs it outright.
 *
 * `admin` must be the service-role client, and deliberately not the caller's session.
 * These are the only rows on the board no user is entitled to choose the value of, and
 * the triggers that used to write them were `security definer` for the same reason:
 * `rating_counts` has never had a write policy, and it keeps none. The authorization
 * that matters happened before any of this — `requireUser()` in the action doing the
 * post write, or the signed-in session the desktop uploader holds.
 *
 * The client is passed in rather than built here so `packages/desktop` can share this
 * file; `createAdminClient()` is `server-only`.
 */

/** Recount `tags.post_count` from `post_tags` for exactly these tags. */
export async function syncTagPostCounts(admin: BooruClient, tagIds: number[]): Promise<void> {
  const ids = [...new Set(tagIds)]
  if (ids.length === 0) return

  // Independent single-row writes, so they go out together rather than one at a time —
  // a 20-tag upload would otherwise pay 20 sequential round trips for bookkeeping.
  await Promise.all(
    ids.map(async (tagId) => {
      const { count, error } = await admin
        .from('post_tags')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', tagId)
      if (error) {
        console.error(`Could not count posts for tag ${tagId}:`, error.message)
        return
      }

      const { error: writeError } = await admin
        .from('tags')
        .update({ post_count: count ?? 0 })
        .eq('id', tagId)
      if (writeError) {
        console.error(`Could not store post_count for tag ${tagId}:`, writeError.message)
      }
    })
  )
}

/** Recount `rating_counts.post_count` from `posts` for exactly these ratings. */
export async function syncRatingCounts(admin: BooruClient, ratings: string[]): Promise<void> {
  const tiers = [...new Set(ratings)]
  if (tiers.length === 0) return

  await Promise.all(
    tiers.map(async (rating) => {
      const { count, error } = await admin
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('rating', rating)
      if (error) {
        console.error(`Could not count posts for rating ${rating}:`, error.message)
        return
      }

      // Upsert, not update: `rating` is free-form text, so the
      // first post on a tier outside the seeded scale has no row to update yet.
      const { error: writeError } = await admin
        .from('rating_counts')
        .upsert({ rating, post_count: count ?? 0 }, { onConflict: 'rating' })
      if (writeError) {
        console.error(`Could not store post_count for rating ${rating}:`, writeError.message)
      }
    })
  )
}
