/**
 * Which board a post belongs to — the one thing every query, path and URL below this
 * line has to agree about.
 *
 * There are two: the gallery, and the generated images. They are the same *kind* of
 * thing, which is why this is a lookup rather than two copies of everything — a post has
 * a rating, a thumbnail, a view count and tags on either board, and the site draws it the
 * same way. What differs is three names: the table its row is in, the table its tag links
 * are in, and the column its tags count it under. A fourth and fifth are where its bytes
 * live, and a sixth is where the listing is addressed.
 *
 * **Spelled once, here.** The whole argument for the separate table (see
 * `db/migrations/0005_generative_posts.sql`) is that mixing the two boards should be
 * impossible rather than merely discouraged, and that only holds if nothing downstream
 * writes `'posts'` into a query by hand. A query takes a `Board` and reads its names out
 * of this table; a page takes a `Board` and hands it to `searchHref`. The default
 * everywhere is `'post'`, so every existing caller means what it always meant.
 *
 * Nothing here is imported from anywhere — it is six strings per board — so it can sit
 * under `@common/storage` and `@common/search` alike without a cycle.
 */

export const BOARDS = ['post', 'generative'] as const

export type Board = (typeof BOARDS)[number]

export type BoardSpec = {
  /** The post table. Interpolated as an identifier, never as a value. */
  posts: string
  /** The (post, tag) link table. */
  postTags: string
  /** The `tags` column counting this board's posts. */
  tagCount: string
  /** Object prefix for the stored post image. */
  postPrefix: string
  /** Object prefix for the stored thumbnail. */
  thumbPrefix: string
  /** Where the listing lives on the website. */
  path: string
  /** What a person calls it, on a nav item or a heading. */
  label: string
}

export const BOARD: Record<Board, BoardSpec> = {
  post: {
    posts: 'posts',
    postTags: 'post_tags',
    tagCount: 'post_count',
    postPrefix: 'posts',
    thumbPrefix: 'thumbs',
    path: '/posts',
    label: 'Posts',
  },
  generative: {
    posts: 'generative_posts',
    postTags: 'generative_post_tags',
    tagCount: 'generative_post_count',
    // Its own folder under the same bucket, rather than its own bucket: the two halves of
    // one board already share one hostname under two prefixes, and a second board is the
    // same argument one level up.
    postPrefix: 'generative/posts',
    thumbPrefix: 'generative/thumbs',
    // `/ai-posts` and not `/generative-posts`, because the nav item and the address should
    // be the words a visitor would use. The code says `generative` throughout — that is
    // what the table is called, and the table is the thing being named.
    path: '/ai-posts',
    label: 'AI posts',
  },
}

/** True for a string that names a board — for reading one back out of a URL segment. */
export function isBoard(value: string): value is Board {
  return (BOARDS as readonly string[]).includes(value)
}
