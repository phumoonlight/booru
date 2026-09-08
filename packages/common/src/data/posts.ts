import { first, type Db } from '@common/db'
import { RESTRICTED_RATINGS, type Rating } from '@common/search'
import type { Tag } from '@common/tags'

/**
 * Post reads, shared by both front ends. These moved out of the website's
 * `src/lib/data/posts.ts` when the desktop app took over managing posts: it needs to
 * load the post it is about to edit, and a second copy of the row shape is how the two
 * quietly disagree about what a post is.
 *
 * Like everything else in this directory they take their handle rather than building
 * one. The web wraps them with `cache()` where a request reads the same row twice; that
 * is a React concern and stays on the web's side.
 */

export type Post = {
  id: number
  file_name: string
  file_ext: string
  file_size: number
  width: number
  height: number
  rating: Rating
  source_url: string | null
  view_count: number
  /** ISO-8601, formatted by the query — see `postColumns`. */
  created_at: string
}

/**
 * The columns behind `Post`, as a fragment, so a select can't quietly drift from the
 * type. It was a string of column names when the reads went through PostgREST and is a
 * piece of SQL now, interpolated into each query below.
 *
 * `created_at` is formatted rather than selected. postgres.js parses `timestamptz` into
 * a `Date`, which is the honest shape and the wrong one here: the row crosses an IPC
 * bridge into Electron's renderer, gets written to the desktop's browse cache as JSON —
 * where a `Date` comes back a string and the type becomes a lie — and is rendered into a
 * `<time dateTime>` attribute, which wants exactly this spelling anyway.
 */
export const postColumns = (db: Db) => db`
  id, file_name, file_ext, file_size, width, height, rating, source_url, view_count,
  to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at`

export type PostPage = {
  posts: Post[]
  /** Whether anything older matched — the feed's "keep going", and nothing more. No
      total: counting the filtered set cost a scan per read, to render a number that
      only a page-number UI ever needed. */
  hasMore: boolean
}

/** How many posts the board holds. `::int` because `count(*)` is a `bigint`, which
 *  postgres.js hands back as a string. */
export async function getPostCount(db: Db): Promise<number> {
  const [row] = await db<{ count: number }[]>`select count(*)::int as count from posts`
  return row?.count ?? 0
}

export async function getPost(db: Db, id: number): Promise<Post | null> {
  return first(await db<Post[]>`select ${postColumns(db)} from posts where id = ${id}`)
}

export async function getPostTags(db: Db, postId: number): Promise<Tag[]> {
  // A join, where this was an embed. Ordered in SQL rather than sorted afterwards, since
  // the database is already reading the rows in an order and picking one costs nothing.
  return await db<Tag[]>`
    select t.id, t.name, t.category, t.mark, t.post_count
      from post_tags pt
      join tags t on t.id = pt.tag_id
     where pt.post_id = ${postId}
     order by t.name`
}

/** Adjacent post ids for prev/next navigation on the detail page. */
export async function getPostNeighbours(
  db: Db,
  id: number
): Promise<{ prevId: number | null; nextId: number | null }> {
  // Both in one round trip. They were two requests because PostgREST answers one query
  // per request; here they are two subqueries of a statement that reads no table twice.
  const [row] = await db<{ prev_id: number | null; next_id: number | null }[]>`
    select (select id from posts where id > ${id} order by id asc  limit 1) as prev_id,
           (select id from posts where id < ${id} order by id desc limit 1) as next_id`
  return { prevId: row?.prev_id ?? null, nextId: row?.next_id ?? null }
}

/**
 * Ids + dates of indexable posts, newest first — the sitemap's source. Drops the
 * restricted tier to match what a search engine is shown.
 */
export async function getSitemapPosts(
  db: Db,
  limit: number
): Promise<Pick<Post, 'id' | 'created_at'>[]> {
  return await db<Pick<Post, 'id' | 'created_at'>[]>`
    select id, to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from posts
     where rating <> all(${[...RESTRICTED_RATINGS]})
     order by id desc
     limit ${limit}`
}
