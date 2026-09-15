import { useCallback, useEffect, useState } from 'react'
import type { Collection } from '../../../shared/api'
import { ShelfList } from './collection-shelves'
import { CollectionView } from './collection-view'

/**
 * Collections: the shelves the website shows.
 *
 * Every post and AI post was moved onto one (0012), so this is the whole of what this window
 * puts on the site. A shelf's images have no tags and no rating of their own — the shelf's
 * rating is theirs — and a shelf of generated images is marked 🤖 rather than being a board
 * of its own.
 *
 * It is two views in one file, because they are two halves of one gesture: the shelf list,
 * and one shelf open. Which one is showing is which shelf is open, and that is kept in a
 * module-level `let` — this view unmounts
 * whenever another is in front of it, and coming back to the list every time you glance at
 * Settings would make the screen unusable for the one job it has.
 *
 * **Uploading here is a batch.** There is nothing per image to type: a batch carries one
 * source, which is the only field an image has, and it is what the images that arrive
 * together usually share — they are the four in one post. So the state a drop creates is
 * "these files, this address", which is small enough to hold in your head and on the screen
 * at once, and correcting it on one image afterwards is a click on its own panel.
 */

/** Which shelf was open. Survives a trip to Settings and back; not written to disk, since
 *  it is a fact about a session. */
let opened: number | null = null

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
        // Undefined for the moment between coming back to an open shelf and the list landing.
        collection={collection}
        // The whole list, because an image's panel offers moving it to any other shelf.
        // Read once by this component and handed down rather than read again down there:
        // a menu per tile would be a read per tile.
        collections={collections}
        siteUrl={siteUrl}
        onBack={() => {
          show(null)
          // The list is holding a count and a cover that this shelf may have just changed,
          // and the way out is the one moment it is worth re-reading.
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
