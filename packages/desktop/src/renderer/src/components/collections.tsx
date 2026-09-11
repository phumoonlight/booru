import { useCallback, useEffect, useState } from 'react'
import { collectionHref, collectionPostHref } from '@common/collections'
import { RATING_COLOR, RATING_LABEL, RATINGS, type Rating } from '@common/search'
import type { Collection, CollectionPost, StageOutcome } from '../../../shared/api'
import {
  BUTTON,
  BUTTON_ON_SURFACE,
  BUTTON_SM,
  BUTTON_SUBMIT_ON_SURFACE,
  buttonToggle,
} from './buttons'
import { FIELD, Panel } from './panel'
import { imageUrlsFrom } from './upload-form'

/**
 * Collections: shelves of images that are not posts.
 *
 * The one screen in this window that the board switch in the header does nothing to. A
 * collection is not a board (`@common/collections`) — its images have no tags, are never
 * searched and appear in neither gallery — so there is no mode here to be in, and none of
 * the channels behind this screen takes a `Board`.
 *
 * It is two views in one file, because they are two halves of one gesture: the shelf list,
 * and one shelf open. Which one is showing is which shelf is open, and that is kept in a
 * module-level `let` for the reason Browse keeps its query in one — this view unmounts
 * whenever another is in front of it, and coming back to the list every time you glance at
 * Settings would make the screen unusable for the one job it has.
 *
 * **Uploading here is a batch, and that is not the queue coming back.** The queue was
 * removed because tagging is per image however the images are stacked, so twenty cards of
 * unsaved state bought nothing; here there is nothing per image to type. A batch carries
 * one rating and one source, which are the only two fields there are, and both are what the
 * images that arrive together usually share — they are the four in one post. So the state a
 * drop creates is "these files, this rating, this address", which is small enough to hold in
 * your head and on the screen at once, and correcting either on one image afterwards is a
 * click on its own panel.
 */

/** Which shelf was open. Survives a trip to Settings and back; not written to disk, since
 *  it is a fact about a session in exactly the way the board mode is. */
let opened: number | null = null

/** A screenful, and what Load more adds. The window is wider than a phone and these are
 *  small tiles, so it is larger than the website's. */
const CHUNK = 40

/**
 * Thumbnails already across the bridge, by file name. Separate from Browse's map only
 * because that one is a module-level `const` in another file; the bytes behind them are
 * shared in main, where the cache is keyed by md5 and so is right for both.
 */
const thumbnails = new Map<string, string>()

async function thumbnailFor(fileName: string): Promise<string> {
  const held = thumbnails.get(fileName)
  if (held !== undefined) return held

  const url = await window.api.collectionThumbnail(fileName)
  // A failed fetch answers '' — not remembered, so asking again re-asks the board.
  if (url) thumbnails.set(fileName, url)
  return url
}

export function Collections({ siteUrl }: { siteUrl: string }) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(opened)

  const refresh = useCallback(async () => {
    setLoading(true)
    setCollections(await window.api.listCollections())
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    void window.api.listCollections().then((rows) => {
      if (!alive) return
      setCollections(rows)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const show = (id: number | null) => {
    opened = id
    setOpen(id)
  }

  if (open !== null) {
    const collection = collections.find((row) => row.id === open)
    return (
      <CollectionView
        // Keyed, so opening another shelf mounts a fresh screen rather than leaving the
        // last one's images up until the read lands.
        key={open}
        collectionId={open}
        name={collection?.name ?? 'Collection'}
        // The whole list, because an image's panel offers moving it to any other shelf.
        // Read once by this component and handed down rather than read again down there:
        // a menu per tile would be a read per tile.
        collections={collections}
        siteUrl={siteUrl}
        onBack={() => {
          show(null)
          // The list is holding a count and a cover that this shelf may have just changed,
          // and the way out is the one moment it is worth re-reading — the same debt
          // Browse pays on the way back from the post editor.
          void refresh()
        }}
      />
    )
  }

  return (
    <ShelfList
      collections={collections}
      loading={loading}
      onRefresh={() => void refresh()}
      onOpen={show}
      onCreated={(id) => {
        // Straight into the shelf just named: naming one is something you do because you
        // have images to put in it.
        void refresh()
        show(id)
      }}
    />
  )
}

/** Every shelf, as cards. The cover is the newest image on it, decided by the query. */
function ShelfList({
  collections,
  loading,
  onRefresh,
  onOpen,
  onCreated,
}: {
  collections: Collection[]
  loading: boolean
  onRefresh: () => void
  onOpen: (id: number) => void
  onCreated: (id: number) => void
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await window.api.createCollection(name)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName('')
    setNaming(false)
    onCreated(result.id)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">🗂️ Collections</h1>
        <span className="text-xs text-muted">
          {loading
            ? 'reading…'
            : `${collections.length} collection${collections.length === 1 ? '' : 's'}`}
        </span>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => {
              setNaming((was) => !was)
              setError(null)
            }}
            aria-pressed={naming}
            className={buttonToggle(naming)}
          >
            <span aria-hidden>➕</span> New collection
          </button>
          <button type="button" onClick={onRefresh} disabled={loading} className={BUTTON}>
            <span aria-hidden className={`transition-opacity ${loading ? 'opacity-30' : ''}`}>
              🔄
            </span>
            Refresh
          </button>
        </div>
      </div>

      {naming && (
        <Panel title="New collection">
          {/* A name and nothing else. There is no cover to choose — it is the newest image
              on the shelf — and nothing to file the shelf under. */}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ukiyo-e studies"
              className={`${FIELD} flex-1`}
            />
            <button type="submit" disabled={busy} className={BUTTON_SUBMIT_ON_SURFACE}>
              <span aria-hidden>✅</span> Create
            </button>
          </form>
          {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
        </Panel>
      )}

      {collections.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading ? 'Loading…' : 'No collections yet. ➕ New collection names one.'}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {collections.map((collection) => (
            <li key={collection.id}>
              <ShelfCard collection={collection} onOpen={() => onOpen(collection.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ShelfCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const cover = collection.cover_file_name
  const [src, setSrc] = useState(cover ? (thumbnails.get(cover) ?? '') : '')

  useEffect(() => {
    if (!cover || thumbnails.has(cover)) return
    let alive = true
    void thumbnailFor(cover).then((url) => {
      if (alive) setSrc(url)
    })
    return () => {
      alive = false
    }
  }, [cover])

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${collection.name}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
    >
      {/* Square, and the one place in this app a thumbnail is cropped. The picture here is
          a label on a box rather than the thing being looked at, and even tiles are what
          make the names read as one column you can run your eye down. */}
      <div className="grid aspect-square place-items-center overflow-hidden bg-background">
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="text-2xl opacity-40">
            🗂️
          </span>
        )}
      </div>
      <span className="flex flex-col gap-0.5 px-1.5 py-1">
        <span className="line-clamp-2 text-xs font-semibold">{collection.name}</span>
        <span className="text-[11px] text-muted">
          {collection.post_count} image{collection.post_count === 1 ? '' : 's'}
        </span>
      </span>
    </button>
  )
}

/** One staged file, on its way onto a shelf. */
type Staged = Extract<StageOutcome, { ok: true }>

/** What happened to one of them once Upload was pressed. */
type Landed = { name: string; ok: boolean; message: string }

function CollectionView({
  collectionId,
  name: initialName,
  collections,
  siteUrl,
  onBack,
}: {
  collectionId: number
  name: string
  collections: Collection[]
  siteUrl: string
  onBack: () => void
}) {
  const [name, setName] = useState(initialName)
  const [posts, setPosts] = useState<CollectionPost[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(initialName)
  const [notice, setNotice] = useState<string | null>(null)

  const [staged, setStaged] = useState<Staged[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [landed, setLanded] = useState<Landed[]>([])
  const [rating, setRating] = useState<Rating>('g')
  // One source for the batch, like the rating and for the same reason: the images that
  // arrive together are usually the four in one post, so the address is the same for all of
  // them and typing it four times is typing it three times too often. It survives the
  // upload rather than being cleared with the staged files — the next drop is very often
  // the next post by the same artist, and a box you have to re-empty is cheaper than one
  // you have to re-fill. Correcting one image's source afterwards is its own panel.
  const [source, setSource] = useState('')
  const [dragging, setDragging] = useState(false)
  const [working, setWorking] = useState<string | null>(null)

  const [editing, setEditing] = useState<number | null>(null)

  // The read is a request to the main process, not a state sync, so the answer sets state
  // from the callback rather than the effect body — and `reload()` below is what turns the
  // spinner on, since that is a thing a press does and not a thing an effect should.
  useEffect(() => {
    let alive = true
    void window.api.listCollectionPosts({ collectionId, perPage: CHUNK }).then((page) => {
      if (!alive) return
      setPosts(page.posts)
      setHasMore(page.hasMore)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [collectionId, nonce])

  /** Read this shelf again — what every write here owes the grid it just changed. */
  const reload = useCallback(() => {
    setLoading(true)
    setNonce((n) => n + 1)
  }, [])

  async function loadMore() {
    const last = posts[posts.length - 1]
    if (!last) return
    setLoading(true)
    const page = await window.api.listCollectionPosts({
      collectionId,
      after: last.id,
      perPage: CHUNK,
    })
    // Appended, never replaced: a chunk landing must not reflow rows already scrolled past.
    setPosts((current) => [...current, ...page.posts])
    setHasMore(page.hasMore)
    setLoading(false)
  }

  /** Takes what a picker or a drop produced and sorts it into "can be uploaded" and "here
   *  is why not" — a duplicate names the shelf it is already on, which is the answer
   *  somebody can act on. */
  const absorb = useCallback((outcomes: StageOutcome[]) => {
    const ready: Staged[] = []
    const refused: string[] = []
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        refused.push(`${outcome.name}: ${outcome.error}`)
      } else if (outcome.duplicateOf !== null) {
        refused.push(
          `${outcome.name}: already in ${outcome.duplicateIn ?? 'another collection'}`
        )
      } else {
        ready.push(outcome)
      }
    }
    setStaged((current) => [
      ...current,
      // The same file dropped twice is one image, and the md5 says so before anything is
      // uploaded — the board's own check would say it afterwards, one encode later.
      ...ready.filter((next) => !current.some((held) => held.md5 === next.md5)),
    ])
    setRejected(refused)
    setLanded([])
  }, [])

  const stage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setWorking(`Reading ${paths.length} image${paths.length === 1 ? '' : 's'}…`)
      try {
        absorb(await window.api.stageFiles(paths, 'collection'))
      } finally {
        setWorking(null)
      }
    },
    [absorb]
  )

  const stageUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return
      setWorking('Downloading…')
      try {
        absorb(await window.api.fetchImages(urls, 'collection'))
      } finally {
        setWorking(null)
      }
    },
    [absorb]
  )

  /**
   * Uploads the batch, one file at a time and in order.
   *
   * Sequential because each of these is a full encode and libvips already spreads one
   * across the cores this app is allowed (`main/cpu.ts`) — running four at once would only
   * make the first finish later. Each answer is kept, so a failure in the middle is a line
   * beside that file rather than the end of the run.
   */
  async function upload() {
    if (staged.length === 0) return
    const results: Landed[] = []
    for (const [at, file] of staged.entries()) {
      setWorking(`Uploading ${at + 1} of ${staged.length}…`)
      const result = await window.api.uploadToCollection({
        collectionId,
        path: file.path,
        rating,
        sourceUrl: source.trim(),
      })
      results.push(
        result.ok
          ? { name: file.name, ok: true, message: `added as #${result.postId}` }
          : { name: file.name, ok: false, message: result.error }
      )
    }
    setWorking(null)
    setStaged([])
    setLanded(results)
    // The grid is now missing whatever landed, and the shelf's cover has moved.
    reload()
  }

  async function rename() {
    const result = await window.api.renameCollection(collectionId, draftName)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setName(result.name)
    setDraftName(result.name)
    setRenaming(false)
    setNotice(null)
  }

  async function destroy() {
    const result = await window.api.deleteCollection(collectionId)
    if (!result.ok) {
      // Which is the ordinary answer while anything is still on the shelf, and the
      // message says how many — see `deleteCollection`.
      setNotice(result.error)
      return
    }
    onBack()
  }

  const editingPost = posts.find((post) => post.id === editing) ?? null

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        // Without an explicit copy effect some sources treat the drop as refused
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        // Everything is read out of dataTransfer *now*: it is emptied the moment this
        // handler returns, so nothing here may be deferred behind an await.
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => window.api.pathForFile(file))
          .filter(Boolean)
        if (paths.length > 0) {
          void stage(paths)
          return
        }
        void stageUrls(imageUrlsFrom(event.dataTransfer))
      }}
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-25"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <button type="button" onClick={onBack} className={BUTTON_SM}>
          <span aria-hidden>⬅️</span> Collections
        </button>
        <h1 className="text-lg font-bold tracking-tight">{name}</h1>
        <span className="text-xs text-muted">
          {loading ? 'reading…' : `${posts.length} image${posts.length === 1 ? '' : 's'}`}
        </span>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => {
              setRenaming((was) => !was)
              setDraftName(name)
              setNotice(null)
            }}
            aria-pressed={renaming}
            className={buttonToggle(renaming)}
          >
            <span aria-hidden>✏️</span> Rename
          </button>
          {siteUrl && (
            <button
              type="button"
              onClick={() =>
                void window.api.openExternal(`${siteUrl}${collectionHref(collectionId)}`)
              }
              title="Open this collection in your browser"
              className={BUTTON}
            >
              <span aria-hidden>🌐</span> Open
            </button>
          )}
          {/* Drawn whatever the shelf holds, and refused with a count while it holds
              anything. A button that disappears when it cannot be used leaves somebody
              wondering where deleting a collection went; one that says why is the answer. */}
          <button type="button" onClick={() => void destroy()} className={BUTTON}>
            <span aria-hidden>🗑️</span> Delete
          </button>
        </div>
      </div>

      {renaming && (
        <Panel title="Rename collection">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void rename()
            }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className={`${FIELD} flex-1`}
            />
            <button type="submit" className={BUTTON_SUBMIT_ON_SURFACE}>
              <span aria-hidden>✅</span> Save
            </button>
          </form>
        </Panel>
      )}

      {notice && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-[#ff5d5f]">
          {notice}
        </p>
      )}

      {/* Adding images. One rating for the batch, because a rating is the only field a
          collection image has and correcting one afterwards is a click on its own panel —
          which is what keeps this from being the upload queue again. */}
      <div
        className={`flex flex-col gap-3 rounded-2xl border-2 border-dashed px-4 py-4 ${
          dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void window.api.chooseFiles().then(stage)}
            disabled={working !== null}
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>📥</span> Add images
          </button>
          <span className="text-xs text-muted">or drop them here</span>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            Rating
            <select
              value={rating}
              onChange={(event) => setRating(event.target.value as Rating)}
              className={`${FIELD} bg-background`}
            >
              {RATINGS.map((value) => (
                <option key={value} value={value}>
                  {RATING_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* The batch's source, on its own line rather than beside the rating: a rating is
            two words and this is a URL, so sharing a row would leave it a stub you cannot
            read what you pasted into. The label says every, because that is the one thing
            somebody adding a second set of images from a different post has to notice. */}
        <label className="flex items-center gap-2 text-xs text-muted">
          Source
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://x.com/… — applied to every image in this batch"
            spellCheck={false}
            className={`${FIELD} min-w-0 flex-1 bg-background`}
          />
          {source !== '' && (
            <button
              type="button"
              onClick={() => setSource('')}
              title="Clear the source"
              aria-label="Clear the source"
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>✕</span>
            </button>
          )}
        </label>

        {working && <p className="text-xs text-muted">{working}</p>}

        {staged.length > 0 && (
          <>
            <ul className="flex flex-wrap gap-2">
              {staged.map((file) => (
                <li key={file.md5} className="relative">
                  <img
                    src={file.preview}
                    alt=""
                    title={file.name}
                    className="size-20 rounded-lg bg-background object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setStaged((current) => current.filter((held) => held.md5 !== file.md5))
                    }
                    title={`Leave out ${file.name}`}
                    aria-label={`Leave out ${file.name}`}
                    className="absolute right-0 top-0 rounded-lg bg-background/80 px-1 text-xs"
                  >
                    <span aria-hidden>✕</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void upload()}
                disabled={working !== null}
                className={BUTTON_SUBMIT_ON_SURFACE}
              >
                <span aria-hidden>⬆️</span> Upload {staged.length} to {name}
              </button>
              <button
                type="button"
                onClick={() => setStaged([])}
                disabled={working !== null}
                className={BUTTON_ON_SURFACE}
              >
                <span aria-hidden>🧹</span> Clear
              </button>
            </div>
          </>
        )}

        {rejected.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-[#ff5d5f]">
            {rejected.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {landed.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs">
            {landed.map((result) => (
              <li key={result.name} className={result.ok ? 'text-muted' : 'text-[#ff5d5f]'}>
                {result.name}: {result.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editingPost && (
        <ImagePanel
          // Keyed, so clicking another tile mounts a fresh panel. Its two boxes are seeded
          // from the row once, which is what lets them be typed in — without this, picking
          // a second image left the first one's rating and source on screen, over a
          // heading naming the second, and the next write would have saved them onto it.
          key={editingPost.id}
          post={editingPost}
          collections={collections}
          siteUrl={siteUrl}
          onClose={() => setEditing(null)}
          onChanged={reload}
          onDeleted={() => {
            setEditing(null)
            reload()
          }}
          // A move is a delete as far as this shelf is concerned — the image is on another
          // one now, so there is nothing here left to have open.
          onMoved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading ? 'Loading…' : 'Nothing in this collection yet.'}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {posts.map((post) => (
              <li key={post.id}>
                <ImageCard post={post} onOpen={() => setEditing(post.id)} />
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
              {loading ? (
                <>
                  <span aria-hidden>⏳</span> Loading…
                </>
              ) : (
                <>
                  <span aria-hidden>⬇️</span> Load {CHUNK} more
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** One tile. It asks for its own image, for the reason Browse's card does: a shelf can be
 *  a few hundred rows after enough scrolling, and fetching them all up front would stall
 *  the first screenful behind the last. */
function ImageCard({ post, onOpen }: { post: CollectionPost; onOpen: () => void }) {
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
      title={`Image ${post.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
    >
      <div className="grid aspect-square place-items-center overflow-hidden bg-background">
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
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
 * One image's panel: its tier, its source, and the way to remove it.
 *
 * It writes on use and puts the old value back if the write fails, which is the post
 * editor's rule and is here for the same reason — there are two fields, and a Save button
 * over two fields is a thing to forget to press. Pinned to the top of the scroller, since
 * the grid it was opened from can be a long way down.
 */
function ImagePanel({
  post,
  collections,
  siteUrl,
  onClose,
  onChanged,
  onDeleted,
  onMoved,
}: {
  post: CollectionPost
  collections: Collection[]
  siteUrl: string
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
  onMoved: () => void
}) {
  const [rating, setRating] = useState<Rating>(post.rating)
  const [source, setSource] = useState(post.source_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function write(next: { rating: Rating; sourceUrl: string }) {
    const result = await window.api.saveCollectionPost({ id: post.id, ...next })
    if (!result.ok) {
      setError(result.error)
      // Back to what the board still holds, which is what the row said when it was read.
      setRating(post.rating)
      setSource(post.source_url ?? '')
      return
    }
    setError(null)
    onChanged()
  }

  return (
    <Panel
      title={`Image #${post.id}`}
      pinned
      actions={
        <>
          {siteUrl && (
            <button
              type="button"
              onClick={() =>
                void window.api.openExternal(
                  `${siteUrl}${collectionPostHref(post.collection_id, post.id)}`
                )
              }
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>🌐</span> Open
            </button>
          )}
          {/* Two presses, because this is the one control here that cannot be taken back —
              the row goes and both stored objects go with it. */}
          <button
            type="button"
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                return
              }
              void window.api.deleteCollectionPost(post.id).then((result) => {
                if (result.ok) onDeleted()
                else setError(result.error)
              })
            }}
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>🗑️</span> {confirming ? 'Really delete' : 'Delete'}
          </button>
          <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
            <span aria-hidden>✕</span> Close
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Which shelf it is on, as a menu of every shelf. A menu rather than a drag onto a
            card: the destination is very often a collection that is not on screen, and this
            panel is already the one place an image is answered questions about. Moving
            costs no bytes — a collection's images are under one flat prefix, so the shelf is
            one column of one row (`moveCollectionPost`). */}
        <label className="flex items-center gap-2 text-xs text-muted">
          Collection
          <select
            value={post.collection_id}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (next === post.collection_id) return
              void window.api.moveCollectionPost(post.id, next).then((result) => {
                if (result.ok) onMoved()
                else setError(result.error)
              })
            }}
            className={FIELD}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          Rating
          <select
            value={rating}
            onChange={(event) => {
              const next = event.target.value as Rating
              setRating(next)
              void write({ rating: next, sourceUrl: source })
            }}
            className={FIELD}
          >
            {RATINGS.map((value) => (
              <option key={value} value={value}>
                {RATING_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
          Source
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            // Written when the box is left rather than on every keystroke: a URL is typed
            // or pasted whole, and a write per character would be a write per character.
            onBlur={() => void write({ rating, sourceUrl: source })}
            placeholder="https://"
            className={`${FIELD} min-w-0 flex-1`}
          />
        </label>
      </div>
      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
    </Panel>
  )
}
