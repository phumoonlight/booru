import { useCallback, useEffect, useState } from 'react'
import { collectionHref } from '@common/collections'
import type { Collection, CollectionPost } from '../../../shared/api'
import { BUTTON, BUTTON_SM, BUTTON_SUBMIT_ON_SURFACE, buttonToggle } from './buttons'
import { FIELD, Panel } from './panel'
import { imageUrlsFrom } from './image-urls'
import { ImageCard, ImagePanel } from './collection-image'
import { StagingBox, useStaging } from './collection-staging'

/** A screenful, and what Load more adds. The window is wider than a phone and these are
 *  small tiles, so it is larger than the website's. */
const CHUNK = 40

/**
 * One shelf, open: its name, what is on it, and the box that puts more there.
 *
 * The whole screen is the drop target rather than the box at the top of it, which is why
 * the staging batch is a hook here (`useStaging`) and a box below — the files land on this
 * element and have to reach the batch being assembled further down the page.
 */
export function CollectionView({
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

  const [dragging, setDragging] = useState(false)
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

  const staging = useStaging(collectionId, reload)

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
          void staging.stage(paths)
          return
        }
        void staging.stageUrls(imageUrlsFrom(event.dataTransfer))
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

      <StagingBox staging={staging} name={name} dragging={dragging} />

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
