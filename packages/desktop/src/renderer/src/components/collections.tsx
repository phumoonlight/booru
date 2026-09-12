import { useCallback, useEffect, useState } from 'react'
import type { Collection } from '../../../shared/api'
import { ShelfList } from './collection-shelves'
import { CollectionView } from './collection-view'

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
