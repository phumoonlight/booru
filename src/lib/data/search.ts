import { createClient } from '@/lib/supabase/server'
import type { Post, PostPage } from '@/lib/data/posts'
import type { Tag } from '@/lib/tags'
import { parseSearchQuery, RATINGS, resolveRatings, splitRatings, type Rating } from '@/lib/search'

export const POSTS_PER_PAGE = 24

type SearchRow = Post & { total_count: number }

/**
 * Multi-tag search via the search_posts RPC (AND over includes, NOT over excludes).
 * An empty query returns the whole gallery, so this backs plain browsing too.
 * Ratings narrow only when the query says so — nothing is hidden by default.
 */
export async function searchPosts({
  query = '',
  page = 1,
  perPage = POSTS_PER_PAGE,
}: {
  query?: string
  page?: number
  perPage?: number
} = {}): Promise<PostPage> {
  const { include, exclude, ratings, excludeRatings } = splitRatings(parseSearchQuery(query))
  const allowedRatings: Rating[] | null = resolveRatings({ ratings, excludeRatings })
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('search_posts', {
    include_tags: include,
    exclude_tags: exclude,
    p_rating: allowedRatings,
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  })

  if (error || !data) {
    return { posts: [], total: 0, page, pageCount: 0 }
  }

  const rows = data as SearchRow[]
  // total_count is a window function over the filtered set — identical on every row
  const total = rows[0]?.total_count ?? 0

  return {
    posts: rows.map((row) => ({
      id: row.id,
      md5: row.md5,
      file_ext: row.file_ext,
      file_size: row.file_size,
      width: row.width,
      height: row.height,
      rating: row.rating,
      source_url: row.source_url,
      view_count: row.view_count,
      created_at: row.created_at,
    })),
    total,
    page,
    pageCount: Math.ceil(total / perPage),
  }
}

/** Autocomplete source: prefix match on tag name, most-used first. */
export async function searchTags(prefix: string, limit = 10): Promise<Tag[]> {
  const term = prefix.trim().toLowerCase()
  if (!term) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('tags')
    .select('id, name, category, post_count')
    // Escape PostgREST pattern wildcards so a literal % or _ can't widen the match
    .ilike('name', `${term.replace(/[%_]/g, '\\$&')}%`)
    .order('post_count', { ascending: false })
    .order('name')
    .limit(limit)

  return data ?? []
}

/**
 * Tags carried by the posts currently on screen, with how many of them use each —
 * this is what fills the tag sidebar / drawer.
 */
export async function getTagsForPosts(postIds: number[]): Promise<{ tag: Tag; count: number }[]> {
  if (postIds.length === 0) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('post_tags')
    .select('tags(id, name, category, post_count)')
    .in('post_id', postIds)

  const counts = new Map<number, { tag: Tag; count: number }>()
  for (const row of data ?? []) {
    const tag = row.tags as unknown as Tag | null
    if (!tag) continue
    const entry = counts.get(tag.id)
    if (entry) entry.count += 1
    else counts.set(tag.id, { tag, count: 1 })
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name)
  )
}

/**
 * Site-wide post count per rating — the whole gallery, not the page on screen, so the
 * rating facet reads like a tag's `post_count`: a fixed scale whose numbers stay put as
 * you page through or narrow the search. `rating_counts` is a denormalized counter row
 * per tier kept current by a trigger on posts, so this is a six-row read, not six
 * `count(*)` scans.
 */
export async function getRatingCounts(): Promise<Record<Rating, number>> {
  const supabase = await createClient()
  const { data } = await supabase.from('rating_counts').select('rating, post_count')

  const counts = Object.fromEntries(RATINGS.map((rating) => [rating, 0])) as Record<Rating, number>
  for (const row of data ?? []) {
    // `rating` is free-form text in the DB; the sidebar only renders the known scale
    if (row.rating in counts) counts[row.rating as Rating] = row.post_count
  }
  return counts
}
