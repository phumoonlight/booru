import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { RATING_COLOR, RATING_LABEL } from '@common/search'
import { categoryColor } from '@common/tags'
import type { Post } from '@common/data/posts'
import type { TagSuggestion } from '../../../shared/api'
import { PostEditor } from './post-editor'
import { BUTTON, BUTTON_SUBMIT, buttonToggle } from './buttons'

/**
 * Browsing the board, and editing what you find.
 *
 * This is the website's gallery and its post-edit panel, moved here when the site lost
 * its login. The site is read-only now — its anon key has no write policy to use — so
 * changing a rating, retagging a post or deleting one happens in this window or not at
 * all.
 *
 * The query box is the site's search bar: `posts:search` runs `@common/data/search`,
 * which is the same function the listing renders through, so `1girl -solo
 * rating:explicit` narrows to the same rows in both places. There is one grammar and
 * one implementation of it.
 *
 * Thumbnails come across the bridge as `data:` URLs (`main/manage.ts`). The window's CSP
 * is `img-src 'self' data:` and stays that way — a grid is not worth being the reason
 * this page can reach the network.
 */

/** What the last visit was looking at. The view unmounts when another is in front of
 *  it, and coming back to an empty box after finding a post is a search typed twice. It
 *  outlives the window too, coming back with the stored grid below — the same argument one
 *  day further out, since the app is closed far more often than this view is. */
let lastQuery = ''

/**
 * Points the next mount of Browse at a query, without being Browse.
 *
 * The Tags screen's "posts tagged this" goes through here: it is the same trick
 * `lastQuery` already is, used deliberately rather than as a convenience, and it works
 * because this view is mounted fresh every time it is switched to and reads `lastQuery`
 * on the way up. The grid cache is left alone — the seed check below already refuses a
 * cache held for a different query, and keeps one held for this exact query, which is the
 * right answer both ways.
 */
export function browseFor(query: string): void {
  lastQuery = query
}

/**
 * How the grid is drawn. Module-level for the same reason the query is: this view is
 * unmounted whenever another is in front of it, and a layout you chose two screens ago is
 * not a thing you should have to choose again. Not written out, unlike the rows and the
 * query: those are a cache of what the board said, droppable and dated, and this is a
 * preference — which would make it `save.json`'s, and it is not worth being one.
 */
type Layout = 'grid' | 'ratio'
let layout: Layout = 'grid'

/**
 * Rows of a fixed height, each image as wide as its own shape makes it — and a ragged
 * right edge, on purpose.
 *
 * It started as the website's justified rows (`src/components/post-grid.tsx`), where each
 * row is stretched to fill the line exactly. That is the right answer for a page and the
 * wrong one here: filling the line means the row's height is whatever the ratios in it
 * happen to need, so a row that drew a wide panorama came out short and every thumbnail
 * beside it shrank with it. Comparing two posts is most of what this screen is for, and
 * it was comparing them at sizes decided by what else landed on their line.
 *
 * So nothing grows. `--row-h` is the height of every image on the screen, the width is
 * `ratio × --row-h`, and whatever is left at the end of a line is left there. The gap at
 * the right edge is the price, and it is a much smaller one than a grid whose scale
 * wanders row by row.
 */

/** Thumbnails are bounded to 768×384 (`@common/imgcmp/for-thumbnail`), so a panorama's
    thumb is at most 2:1 however wide the post is. Laying it out at the post's own ratio
    would reserve width the image cannot fill. */
const MAX_RATIO = 2

function ratioOf(width: number, height: number): number {
  return Math.min(width / Math.max(height, 1), MAX_RATIO)
}

/**
 * The tile's width, and nothing else — no grow, no basis, no cap. The height comes from
 * the image box's own `aspectRatio` against this width, which works out to exactly
 * `--row-h` for every card on the screen.
 */
function itemStyle(width: number, height: number): CSSProperties {
  return { width: `calc(${ratioOf(width, height)} * var(--row-h))` }
}

/**
 * And what it was looking *at*: the rows already read for `lastQuery`, chunks from Load
 * more included. Same reasoning as the box, one step further — this screen is unmounted
 * whenever another view is in front of it, so opening Settings and coming back used to
 * re-run the search and re-fetch every thumbnail to arrive at the grid that was already
 * on screen a second ago. The board does not change while you are reading About.
 *
 * A cache that can go stale needs a way to say so, which is the 🔄 beside the title, and
 * `invalidateBrowse()` for the one moment the app knows it is wrong.
 *
 * It is also written out, so the grid survives the window closing — `main/browse-cache.ts`
 * holds it for a day, which is as long as rows anyone would recognise are worth drawing.
 * This copy is still the one every render reads; the file is only how it starts.
 */
let cached: { query: string; posts: Post[]; hasMore: boolean; at: number } | null = null

function remember(query: string, posts: Post[], hasMore: boolean): void {
  // `at` is the last read, Load more included: what the line beside the title answers is
  // "how old is what I am looking at", and a chunk that landed a second ago is part of it.
  cached = { query, posts, hasMore, at: Date.now() }
  // And through to `app-cache/browse-cache.json`, so the same rows survive the window
  // closing. Not awaited: the grid is already drawn from the copy above, and a write that
  // fails costs the next launch a read it was going to be able to do anyway.
  void window.api.writeBrowseCache({ query, posts, hasMore })
}

/**
 * Drops the remembered grid without reading anything, so the next visit asks the board.
 * Called when an upload lands — the one change this window makes that the grid cannot
 * see, an edit being something it walked into the editor to do — and by 🔄, which is the
 * one way a person says it.
 *
 * The file goes with it. A cache in two places that can be invalidated in one is a cache
 * that comes back from the dead on the next launch.
 */
export function invalidateBrowse(): void {
  cached = null
  void window.api.clearBrowseCache()
}

/**
 * The stored grid, back into the two module-level `let`s above, before anything renders.
 *
 * It has to happen first because `Browse` reads them synchronously on the way up — the
 * seed is what stops the mount running a search it did not need — and the file is behind
 * an IPC round trip. `App` awaits this alongside its first status read, which it is
 * already showing "Starting…" for, so the cost is nothing and the grid is either there or
 * not by the time any screen exists.
 *
 * The query comes back with the rows. Without it the box would be empty and the seed
 * check below would reject a cache held for a query nobody is asking any more, which is
 * the same as not having stored it.
 */
export async function hydrateBrowseCache(): Promise<void> {
  const file = await window.api.readBrowseCache()
  if (!file) return
  cached = { query: file.query, posts: file.posts, hasMore: file.hasMore, at: file.at }
  lastQuery = file.query
}

/**
 * Thumbnails already across the bridge, by file name. `main/manage.ts` caches the bytes
 * on its side, so this saves the IPC round trip and the re-decode rather than the
 * download — enough to make a returning grid paint in one frame instead of filling in
 * tile by tile. Never invalidated: the name is the file's md5, so a name that comes back
 * is the same image by definition.
 */
const thumbnails = new Map<string, string>()

/**
 * A post's thumbnail, from that cache or from the bridge. Exported because the upload
 * screen's tag import draws the same grid of posts, and a second copy of every image in
 * the window is the one thing this cache exists to avoid.
 */
export async function thumbnailFor(fileName: string): Promise<string> {
  const held = thumbnails.get(fileName)
  if (held !== undefined) return held

  const url = await window.api.postThumbnail(fileName)
  // A failed fetch answers '' — not remembered, so asking again re-asks the board.
  if (url) thumbnails.set(fileName, url)
  return url
}

const CHUNK = 24

/**
 * Five names under the box, and no more.
 *
 * The box takes a whole query — several tags, exclusions, a rating — so the list under it
 * is an aid to spelling one word, not a way of browsing the vocabulary. That is the Tags
 * screen, which has the whole of it with counts and categories. Five is what can be read
 * without moving your eyes off what you were typing; a longer list would cover the top row
 * of the grid you are searching, to offer tags nobody was going to read.
 */
const SUGGESTION_LIMIT = 5

/**
 * The word being typed, and everything before it. Space-separated is the whole of the
 * query grammar (`splitQuery`), so the token being completed is the last one — this box
 * is typed left to right and a completion lands where the caret is.
 */
function typedToken(query: string): { before: string; token: string } {
  const cut = query.lastIndexOf(' ')
  return { before: query.slice(0, cut + 1), token: query.slice(cut + 1) }
}

/** How old the grid is: the time, and the date as well once it is no longer today's. */
function readAt(at: number): string {
  const when = new Date(at)
  const time = when.toLocaleTimeString([], { timeStyle: 'short' })
  return when.toDateString() === new Date().toDateString()
    ? time
    : `${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

/**
 * A query that is nothing but a post number, or null.
 *
 * Typing `11` into this box means post 11 far more often than it means a tag called `11`,
 * and reaching one post by its number is what this window is usually for — you have the
 * id from an upload, from the board, from a report. It is a convenience of *this box* and
 * not of the search grammar: `@common/data/search` is shared with the website and there is
 * one implementation of it, so a bare number still means a tag everywhere else.
 *
 * The tag reading is not given up, only tried second — `2024` is a plausible tag name, and
 * a board that has one would otherwise lose it to a post number that may not even exist.
 */
function asPostId(query: string): number | null {
  const value = Number(query.trim())
  return /^\d+$/.test(query.trim()) && Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * One post, shaped like a page, so the id lookup and the search return the same thing.
 *
 * Exported for the upload screen's tag import, which is this box in a dialog: typing a
 * post number there means the same thing it means here, and a second implementation of
 * that convenience would be a second place for it to disagree.
 */
export async function readPosts(query: string): Promise<{ posts: Post[]; hasMore: boolean }> {
  const id = asPostId(query)
  if (id !== null) {
    const loaded = await window.api.getPost(id)
    if (loaded) return { posts: [loaded.post], hasMore: false }
  }
  return window.api.searchPosts({ query })
}

export function Browse({
  siteUrl,
  initialEdit = null,
}: {
  siteUrl: string
  /**
   * A post to open the editor on straight away — the queue's Review after an upload. A
   * prop rather than the module-level trick `lastQuery` uses, because this screen is
   * mounted fresh every time it is switched to, so the prop is read exactly once and a
   * second visit doesn't reopen an editor nobody asked for.
   */
  initialEdit?: number | null
}) {
  // The cache is only ever held for `lastQuery`, which is where the box below starts,
  // so the two agree by construction — checked rather than assumed, since a grid seeded
  // with rows that answer another query is the one way this could lie.
  const seed = cached?.query === lastQuery ? cached : null

  const [query, setQuery] = useState(lastQuery)
  const [submitted, setSubmitted] = useState(lastQuery)
  const [posts, setPosts] = useState<Post[]>(seed?.posts ?? [])
  const [hasMore, setHasMore] = useState(seed?.hasMore ?? false)
  const [fetchedAt, setFetchedAt] = useState<number | null>(seed?.at ?? null)
  const [loading, setLoading] = useState(seed === null)
  const [editing, setEditing] = useState<number | null>(initialEdit)
  // A save leaves the grid's copy of that row stale. It is not re-read then — the editor
  // is still the screen in front, and swapping it out was the old behaviour this replaced
  // — so the debt is noted here and paid on the way back out.
  const [stale, setStale] = useState(false)
  // Mirrors the module-level `layout` into React so a press repaints; the module copy is
  // what the next visit reads.
  const [drawnAs, setDrawnAs] = useState<Layout>(layout)

  // The read is a request to the main process, not a state sync, so the answer sets
  // state from the callback rather than the effect body — the effect itself touches
  // nothing, and a screen left before the reply lands is left alone.
  //
  // `nonce` is what makes Search re-run on a query that has not changed. `submitted`
  // alone would not: pressing Search after an edit is exactly how you ask for the same
  // rows again, and a dependency that compares equal never fires.
  const [nonce, setNonce] = useState(0)

  // True for exactly one render: the mount that was seeded from the cache. The effect
  // below runs on mount whatever state was seeded with, and this is what stops it turning
  // the seed into the read it was meant to save.
  const seeded = useRef(seed !== null)

  // Autocomplete for the box below. The names come from the same cached index the tag
  // fields use (`main/tag-cache.ts`), so a keystroke is a prefix match in memory rather
  // than a query — which is why there is no debounce here to explain away.
  const [options, setOptions] = useState<TagSuggestion[]>([])
  const [highlight, setHighlight] = useState(-1)
  // Shut by Escape or by looking elsewhere, without throwing the names away: coming back
  // to a box you were already typing in should not have to re-earn its list.
  const [shut, setShut] = useState(false)
  const box = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (seeded.current) {
      seeded.current = false
      return
    }
    let alive = true
    void readPosts(submitted).then((page) => {
      remember(submitted, page.posts, page.hasMore)
      if (!alive) return
      setPosts(page.posts)
      setHasMore(page.hasMore)
      setFetchedAt(cached?.at ?? null)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [submitted, nonce])

  // A leading `-` excludes the tag it names, so it is part of the query and not of the
  // word: `-sol` is asking to complete `solo`. A `:` is a metatag — `rating:`, `start:` —
  // and there is nothing in the tag index to complete it with.
  const { before, token } = typedToken(query)
  const needle = token.startsWith('-') ? token.slice(1) : token
  const completing = needle !== '' && !needle.includes(':')

  useEffect(() => {
    if (!completing) return
    let alive = true
    void window.api.suggestTags(needle).then((tags) => {
      if (alive) setOptions(tags)
    })
    return () => {
      alive = false
    }
  }, [needle, completing])

  /**
   * What is actually under the box, worked out as it is drawn rather than stored.
   *
   * The read behind `options` is a round trip, so between a keystroke and its answer the
   * list is holding names for the word as it was one letter ago. Filtering here means the
   * list never shows a name that does not match what is on screen — it goes briefly short
   * rather than briefly wrong — and it is what keeps the state out of the effect.
   *
   * What the rest of the query already names is left out, the tag just completed
   * included, which would otherwise head its own list.
   */
  const already = new Set(
    before
      .split(' ')
      .filter(Boolean)
      .map((word) => (word.startsWith('-') ? word.slice(1) : word))
  )
  const showing =
    shut || !completing
      ? []
      : options
          .filter((tag) => tag.name.startsWith(needle) && !already.has(tag.name))
          .slice(0, SUGGESTION_LIMIT)

  /** Puts a name in place of the word being typed, with the trailing space that starts
   *  the next one — the list is for building a query, not for ending one. */
  function complete(name: string) {
    setQuery(`${before}${token.startsWith('-') ? '-' : ''}${name} `)
    setHighlight(-1)
    box.current?.focus()
  }

  /** Answers with what it appended, so the editor's → can step straight into it. */
  async function loadMore(): Promise<Post[]> {
    const last = posts[posts.length - 1]
    if (!last) return []
    setLoading(true)
    const page = await window.api.searchPosts({ query: submitted, after: last.id })
    // Appended, never replaced: a chunk landing must not reflow rows already scrolled past.
    setPosts((current) => {
      const next = [...current, ...page.posts]
      // Remembered here too, or coming back would drop every chunk but the first and
      // leave you scrolling the same rows a second time.
      remember(submitted, next, page.hasMore)
      return next
    })
    setHasMore(page.hasMore)
    setFetchedAt(cached?.at ?? null)
    setLoading(false)
    return page.posts
  }

  /** What the cache costs: one button that says the grid may be old and reads it again. */
  function refresh() {
    invalidateBrowse()
    setLoading(true)
    setNonce((n) => n + 1)
  }

  function submit(next: string) {
    lastQuery = next
    // The remembered rows answer the old query and would otherwise sit under the new one
    // until the read lands.
    invalidateBrowse()
    setLoading(true)
    setSubmitted(next)
    setNonce((n) => n + 1)
  }

  /** A deleted post has nothing left to edit, so that one does leave — and the grid it
   *  returns to is holding a row that is gone. */
  const closeAndReload = useCallback(() => {
    setEditing(null)
    setStale(false)
    invalidateBrowse()
    setLoading(true)
    setNonce((n) => n + 1)
  }, [])

  /** Back out of the editor, re-reading only if something was actually saved. */
  const close = useCallback(() => {
    if (stale) {
      closeAndReload()
      return
    }
    setEditing(null)
  }, [stale, closeAndReload])

  if (editing !== null) {
    // Where the open post sits in the grid, and so what ← and → mean. -1 when it was
    // opened from somewhere the grid has no row for — the queue's Review after an upload
    // — where both arrows are simply dead.
    const at = posts.findIndex((post) => post.id === editing)
    const previous = at > 0 ? posts[at - 1] : null
    const next = at >= 0 ? (posts[at + 1] ?? null) : null

    return (
      <PostEditor
        // Keyed, so stepping to another post mounts a fresh screen rather than leaving
        // the last one's tags and picture up until the read lands.
        key={editing}
        postId={editing}
        siteUrl={siteUrl}
        onSaved={() => setStale(true)}
        onDeleted={closeAndReload}
        onClose={close}
        // Typing a number in the heading goes straight there, whether or not the grid
        // behind holds it — the grid is a search, and a post you have the id for is
        // usually one you were sent rather than one you found.
        onJump={(id) => setEditing(id)}
        onPrev={previous ? () => setEditing(previous.id) : null}
        onNext={
          next
            ? () => setEditing(next.id)
            : // The end of what has been read is not the end of the search: → reads the
              // next chunk and steps into it, the same thing Load more does behind here.
              at >= 0 && hasMore
              ? () => {
                  void loadMore().then((more) => {
                    if (more[0]) setEditing(more[0].id)
                  })
                }
              : null
        }
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">Browse</h1>
        <span className="text-xs text-muted">
          {loading ? 'reading…' : `${posts.length} post${posts.length === 1 ? '' : 's'}`}
        </span>
        {/* What a cache owes you, same as the Tags screen: how old the grid is. The time
            alone was enough while it died with the window; it is kept for a day now, so a
            grid read yesterday says so rather than claiming to be from this morning. */}
        {fetchedAt !== null && (
          <span className="text-xs text-muted">as of {readAt(fetchedAt)}</span>
        )}
        {/* Two ways of looking at the same rows, so a pair rather than one button whose
            label is whichever one you are not in — that reads as a command and gets
            pressed to get back to where you already were. */}
        <div className="ml-auto flex items-center">
          <LayoutButton
            active={drawnAs === 'grid'}
            onClick={() => {
              layout = 'grid'
              setDrawnAs('grid')
            }}
            emoji="🔳"
            label="Grid"
            title="Even columns, every thumbnail cropped square"
          />
          <LayoutButton
            active={drawnAs === 'ratio'}
            onClick={() => {
              layout = 'ratio'
              setDrawnAs('ratio')
            }}
            emoji="📐"
            label="Ratio"
            title="Each image at its own shape, in rows of equal height"
          />
        </div>
      </div>

      {/* A browser's toolbar: reload at the head of the row, then the box, filling
          everything left. Refresh was in the far corner of the title row, which put the
          two controls that both mean "read the board" at opposite ends of the screen —
          and left the box beside it stopping short of the edge for no reason. */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(query.trim())
        }}
        className="flex items-center gap-2"
      >
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          title="Read these posts again"
          className={BUTTON}
        >
          {/* Faded, not spun. A spinner on a single glyph is a lot of motion in the corner
              of the eye for a read that is usually over before it is noticed, and an emoji
              rotating about its own box wobbles. Dimming says the same thing quietly. */}
          <span aria-hidden className={`transition-opacity ${loading ? 'opacity-30' : ''}`}>
            🔄
          </span>
          Refresh
        </button>
        {/* The box and its list are one thing on the row, so the list can be positioned
            against the box rather than against the toolbar. */}
        <div className="relative flex-1">
          <input
            ref={box}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setShut(false)
              // Another letter is another list; keeping the row number would move the
              // highlight onto whatever name happens to land there.
              setHighlight(-1)
            }}
            onFocus={() => setShut(false)}
            // Closed on the way out rather than on a click, which would land after the
            // list had already gone; the options refuse the focus in the first place.
            onBlur={() => setShut(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setShut(true)
                return
              }
              if (showing.length === 0) return
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setHighlight((at) => (at + 1) % showing.length)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setHighlight((at) => (at <= 0 ? showing.length : at) - 1)
              } else if (event.key === 'Enter' && highlight >= 0) {
                // Enter on a highlighted name completes it instead of searching: the
                // query is half-typed, and running it now is never what was meant.
                event.preventDefault()
                complete(showing[highlight].name)
              }
            }}
            placeholder="1girl blue_hair -solo rating:explicit"
            spellCheck={false}
            className="min-h-9 w-full rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
          />
          {showing.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-surface">
              {showing.map((tag, at) => (
                <li key={tag.name}>
                  <button
                    type="button"
                    // Never takes the focus, so the box keeps it and the blur above never
                    // fires — a list that closed on mousedown could not be clicked.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => complete(tag.name)}
                    onMouseEnter={() => setHighlight(at)}
                    className={`flex w-full items-center gap-3 px-3 py-1.5 text-left font-mono text-sm ${
                      at === highlight ? 'bg-background' : ''
                    }`}
                  >
                    {/* The name as it is typed, underscores and all — this box takes a
                        query, not a label. Its colour is its category, which is what says
                        a `blue_hair` from a `blue_archive` at a glance. */}
                    <span className={categoryColor(tag.category)}>{tag.name}</span>
                    <span className="ml-auto text-xs text-muted">{tag.post_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className={BUTTON_SUBMIT}>
          <span aria-hidden>🔍</span> Search
        </button>
        {submitted !== '' && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              submit('')
            }}
            className={BUTTON}
          >
            <span aria-hidden>🧹</span> Clear
          </button>
        )}
      </form>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading ? 'Loading…' : submitted ? 'No posts match that search.' : 'No posts yet.'}
        </p>
      ) : (
        <>
          {/* Centred in the ratio layout: nothing stretches to fill a line any more, so the
              slack is real and putting all of it on the right made every row look like it
              had stopped short of something. Split between both edges it reads as a
              margin. The square grid needs none of this — its columns already fill. */}
          <ul
            className={
              drawnAs === 'ratio'
                ? 'flex flex-wrap justify-center gap-2 [--row-h:9rem] sm:[--row-h:11rem] lg:[--row-h:13rem]'
                : 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6'
            }
          >
            {posts.map((post) => (
              <li
                key={post.id}
                className={drawnAs === 'ratio' ? 'shrink-0' : undefined}
                style={drawnAs === 'ratio' ? itemStyle(post.width, post.height) : undefined}
              >
                <Card post={post} layout={drawnAs} onOpen={() => setEditing(post.id)} />
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className={`${BUTTON} mx-auto`}
            >
              {loading ? 'Loading…' : `Load ${CHUNK} more`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * One thumbnail. It asks for its own image rather than being handed one: the grid can
 * hold a few hundred rows after enough scrolling, and fetching them all up front would
 * stall the first screenful behind the last.
 */
function Card({
  post,
  layout: drawnAs,
  onOpen,
}: {
  post: Post
  layout: Layout
  onOpen: () => void
}) {
  const [src, setSrc] = useState(thumbnails.get(post.file_name) ?? '')

  useEffect(() => {
    if (thumbnails.has(post.file_name)) return
    let alive = true
    void thumbnailFor(post.file_name).then((url) => {
      if (alive) setSrc(url)
    })
    return () => {
      alive = false
    }
  }, [post.file_name])

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Edit post ${post.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
    >
      {/* Square in the grid, the image's own shape in a ratio row — the only thing the
          two layouts differ in. Against the tile's fixed `ratio × --row-h` width this
          resolves to exactly `--row-h` tall, which is what keeps the row even. The strip below is the same either way: a caption
          burned over the picture reads worse on a dark thumbnail than beside it, and a
          card that changes what it *is* between layouts makes the toggle feel like two
          screens rather than two ways of looking at one. */}
      <div
        className={`grid place-items-center overflow-hidden bg-background ${
          drawnAs === 'ratio' ? '' : 'aspect-square'
        }`}
        style={
          drawnAs === 'ratio' ? { aspectRatio: ratioOf(post.width, post.height) } : undefined
        }
      >
        {src ? (
          <img src={src} alt={`Post ${post.id}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">…</span>
        )}
      </div>
      <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-[11px]">
        <span className="text-muted">#{post.id}</span>
        <span className={RATING_COLOR[post.rating]}>{RATING_LABEL[post.rating]}</span>
      </span>
    </button>
  )
}

/**
 * One half of the layout pair. Drawn like the Refresh beside it — glyph, word, underline
 * on hover — with the current one in accent rather than boxed, since a border here would
 * put two more rectangles in a title row that already has none.
 */
function LayoutButton({
  active,
  onClick,
  emoji,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  emoji: string
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={buttonToggle(active)}
    >
      <span aria-hidden className={active ? undefined : 'opacity-60'}>
        {emoji}
      </span>
      <span className={active ? 'font-semibold' : undefined}>{label}</span>
    </button>
  )
}
