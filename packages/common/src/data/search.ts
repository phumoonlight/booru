import { BOARD, type Board } from '@common/board'
import type { Db } from '@common/db'
import { postColumns, type Post, type PostPage } from '@common/data/posts'
import { parseSearchQuery, resolveRatings, splitQuery, type Rating } from '@common/search'
import type { Tag } from '@common/tags'

/**
 * The search itself — the one query surface, shared by the website's listing and the
 * desktop app's browse screen. A second implementation of the grammar would mean `-tag`
 * behaving differently depending on which window you typed it in.
 *
 * **It is one statement now, and that is most of the payoff of leaving PostgREST.** A
 * multi-tag AND is the one thing PostgREST genuinely cannot express, so this file used
 * to work around it: resolve the tag names to ids, read every `(post, tag)` link those
 * tags carry — in thousand-row pages, because a request answers with at most one page —
 * intersect them in a `Map` of `Set`s, and hand the surviving ids back to the database
 * as a literal `in (…)` list. About a hundred lines, four round trips, and a payload
 * bounded by the popularity of the tags rather than by the size of the screenful being
 * drawn. `1girl` on a board of any size dragged every link it had over the wire to
 * render ten thumbnails.
 *
 * What replaces it is below: a correlated count for the includes and a `not exists` for
 * the excludes.
 *
 * **Every read here takes a board** (`@common/board`) and reads its table names out of
 * it. The grammar, the cursor and the rating ceiling are the board's business not at all
 * — `-tag` means the same thing on `/posts` and on `/ai-posts`, which is the whole reason
 * the second board is a pair of table names rather than a second copy of this file.
 */

/**
 * The opening screenful, and the default read size for anything that doesn't say
 * otherwise. Small because it is the one read a visitor waits on with nothing on
 * screen — the feed covers the rest before they reach it.
 */
export const POSTS_PER_PAGE = 10

/**
 * What each scroll appends after that. Kept separate from the opening read even while
 * the two numbers agree: one is a cold wait, the other is prefetched ahead of the
 * viewport, so they answer to different things and get tuned apart.
 */
export const FEED_CHUNK_SIZE = 10

/**
 * Multi-tag search: AND over includes, NOT over excludes.
 * An empty query returns the whole gallery, so this backs plain browsing too.
 *
 * One function for both halves of the feed: no cursor is the newest screenful, the one
 * the server renders and a crawler sees; `after` is every chunk the browser appends.
 */
export async function searchPosts(
  db: Db,
  {
    query = '',
    perPage = POSTS_PER_PAGE,
    after,
    visibleRatings,
    board = 'post',
  }: {
    /** Tags, rating metatags, and the `start:` cursor — the whole address of a listing. */
    query?: string
    perPage?: number
    /** Which board is being listed. The gallery unless said otherwise. */
    board?: Board
    /** Continue point: strictly older than this post. The feed's own, never in the URL. */
    after?: number
    /**
     * The tiers this caller is willing to list, as a ceiling the query narrows within.
     * Omitted means all of them — the desktop app browses the whole board, and the policy
     * of which tiers a *visitor* gets belongs to the website's own wrapper, not here.
     */
    visibleRatings?: readonly Rating[]
  } = {}
): Promise<PostPage> {
  const { include, exclude, ratings, excludeRatings, start } = splitQuery(parseSearchQuery(query))
  const allowed = resolveRatings({ ratings, excludeRatings }, visibleRatings)
  const { posts, postTags } = BOARD[board]

  try {
    // It reads one row more than it returns, and that spare row is the whole answer to
    // "is there more". Nothing counts: an exact count scanned the filtered set on every
    // read, and the only thing that ever needed the total was a page number.
    // A note on the clauses below, which cannot carry comments of their own: an SQL
    // comment inside a JS template literal is still JS, and a backtick in one would end
    // the string.
    //
    // The rating ceiling is already intersected with whatever the query asked for. Null
    // means every tier; an empty list is a real answer and matches nothing, which is
    // what rating:r18 typed with the setting off honestly returns.
    //
    // Included tags are matched by name, not by id. Resolving them first would be a
    // second round trip to learn what the join already knows, and a name nobody has used
    // simply fails to reach the count — so an unknown tag returns nothing rather than
    // being silently dropped from the query. Excludes are the same join as an anti-join.
    // Both degrade correctly when empty: a count of 0 is compared against 0, and a "not
    // exists" over a condition nothing satisfies is true for every row. That is why this
    // is one fixed statement for every query shape rather than a request assembled out
    // of whatever was typed.
    //
    // Then two cursors, which mean different things. start: is a starting *line*, from
    // the query's own metatag — the post it names has to be first on screen, so it is
    // inclusive. after is where the feed continues from, chunk to chunk, so it is
    // exclusive. Both are ids rather than offsets, which is what makes an upload landing
    // mid-scroll a non-event: id < 900 names the same rows it did a minute ago, where
    // offset 48 slides everything down one and hands you a post you already have.
    const rows = await db<Post[]>`
      select ${postColumns(db)}
        from ${db(posts)} p
       where (${allowed}::text[] is null or p.rating = any(${allowed}::text[]))
         and (select count(distinct pt.tag_id)
                from ${db(postTags)} pt
                join tags t on t.id = pt.tag_id
               where pt.post_id = p.id
                 and t.name = any(${include}::text[])) = ${include.length}
         and not exists (select 1
                           from ${db(postTags)} pt
                           join tags t on t.id = pt.tag_id
                          where pt.post_id = p.id
                            and t.name = any(${exclude}::text[]))
         and (${start}::int is null or p.id <= ${start}::int)
         and (${after ?? null}::int is null or p.id < ${after ?? null}::int)
       order by p.id desc
       limit ${perPage + 1}`

    return { posts: rows.slice(0, perPage), hasMore: rows.length > perPage }
  } catch (error) {
    // The grid renders empty rather than throwing, so the reason has to be logged
    console.error('searchPosts failed:', error)
    return { posts: [], hasMore: false }
  }
}

/**
 * The posts either side of one, *within a search* — what prev/next walks.
 *
 * It was `getPostNeighbours`, two subqueries over the whole board, and it disagreed with
 * the listing twice over. A post opened from `1girl` stepped to whatever was uploaded
 * next, tagged or not; and with the adult tiers switched off, the walk led straight into
 * a post the gallery had just declined to show, which then rendered its own refusal —
 * the setting was honoured everywhere except the one control whose whole job is moving
 * between posts. The filters are the search's, so both follow from asking the same
 * question the listing asks.
 *
 * `start:` is deliberately ignored: it says where the listing *began*, which is a
 * scrolling position, not a wall. Walking back past it from a post you opened is the
 * ordinary thing to want.
 *
 * The filters are written once, in a CTE, and `not materialized` so the planner may
 * inline it into each side and stop at the first row either way — the alternative reads
 * every matching id to find the two next to one.
 */
export async function searchNeighbours(
  db: Db,
  {
    id,
    query = '',
    visibleRatings,
    board = 'post',
  }: { id: number; query?: string; visibleRatings?: readonly Rating[]; board?: Board }
): Promise<{ prevId: number | null; nextId: number | null }> {
  const { include, exclude, ratings, excludeRatings } = splitQuery(parseSearchQuery(query))
  const allowed = resolveRatings({ ratings, excludeRatings }, visibleRatings)
  const { posts, postTags } = BOARD[board]

  try {
    const [row] = await db<{ prev_id: number | null; next_id: number | null }[]>`
      with matching as not materialized (
        select p.id
          from ${db(posts)} p
         where (${allowed}::text[] is null or p.rating = any(${allowed}::text[]))
           and (select count(distinct pt.tag_id)
                  from ${db(postTags)} pt
                  join tags t on t.id = pt.tag_id
                 where pt.post_id = p.id
                   and t.name = any(${include}::text[])) = ${include.length}
           and not exists (select 1
                             from ${db(postTags)} pt
                             join tags t on t.id = pt.tag_id
                            where pt.post_id = p.id
                              and t.name = any(${exclude}::text[]))
      )
      select (select id from matching where id > ${id} order by id asc  limit 1) as prev_id,
             (select id from matching where id < ${id} order by id desc limit 1) as next_id`

    return { prevId: row?.prev_id ?? null, nextId: row?.next_id ?? null }
  } catch (error) {
    // The arrows disappear rather than the page failing — they are a way around, not the
    // post, and the post is what the reader came for.
    console.error('searchNeighbours failed:', error)
    return { prevId: null, nextId: null }
  }
}

/**
 * Tags carried by the posts currently on screen — this is what fills the tag sidebar /
 * drawer. Which tags appear is decided by the page, but the number beside each one is
 * the tag's site-wide `post_count`, the same figure the detail page and the search
 * suggestions show, so a tag doesn't read as three posts here and three hundred one
 * click later. The on-screen frequency is still counted, and still orders what comes
 * back: the sidebar keeps only the first 50, so the tags describing most of what you are
 * looking at are the ones that survive the cut.
 *
 * The counting and the ordering are the database's now — this was a `Map` built over
 * every link row of every post on screen.
 */
export async function getTagsForPosts(
  db: Db,
  postIds: number[],
  board: Board = 'post'
): Promise<{ tag: Tag; count: number }[]> {
  if (postIds.length === 0) return []

  const { postTags, tagCount } = BOARD[board]

  // The count column is this board's and comes back aliased to `post_count`, so a `Tag`
  // keeps one shape wherever it is drawn — the number beside a tag in the AI listing's
  // drawer is how many AI posts carry it, which is the only figure that page can compare
  // anything against.
  const rows = await db<(Tag & { on_page: number })[]>`
    select t.id, t.name, t.category, t.mark, t.${db(tagCount)} as post_count,
           count(*)::int as on_page
      from ${db(postTags)} pt
      join tags t on t.id = pt.tag_id
     where pt.post_id = any(${postIds})
     group by t.id
     order by on_page desc, t.${db(tagCount)} desc, t.name`

  // `on_page` ordered the rows and has done its job by here; the number beside a tag in
  // the sidebar is its site-wide count, not its count on this screenful.
  return rows.map((row) => ({
    tag: {
      id: row.id,
      name: row.name,
      category: row.category,
      mark: row.mark,
      post_count: row.post_count,
    },
    count: row.post_count,
  }))
}
