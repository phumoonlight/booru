import { readFile } from 'node:fs/promises'
import { listArtists, getArtistImage, type Artist } from '@common/data/artists'
import {
  addArtistUrl,
  createArtist,
  deleteArtistImageRow,
  deleteArtistRows,
  markArtistRead,
  removeArtistUrl,
  renameArtist,
  setArtistAi,
  setArtistArchived,
  setArtistFavorite,
} from '@common/data/artists-write'
import { artistImagePath, artistThumbnailPath } from '@common/storage'
import { createArtistImageFromImage, type ArtistImageResult } from '@common/upload/artist'
import type { ObjectStore } from '@common/storage'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { boardDb } from './db'
import { boardStore } from './r2'
import { boardImageUrl } from './config'
import { cachedThumbnail, forgetThumbnail } from './manage'

/**
 * The artist list, from the side that holds the keys.
 *
 * Kept apart from every other feature: nothing here touches the tag cache, the browse grid
 * or a board, because an artist is none of those. The example thumbnails share the one
 * thumbnail cache anyway — it is keyed by md5, and a name that is the hash of the bytes is
 * the same picture whichever table it came from.
 */

const NOT_SET_UP = { ok: false as const, error: 'Not set up yet' }

export async function readArtists(): Promise<Artist[]> {
  const db = boardDb()
  return db ? listArtists(db) : []
}

export async function makeArtist(name: string, isAi: boolean, isFavorite: boolean) {
  const db = boardDb()
  return db ? createArtist(db, name, isAi, isFavorite) : NOT_SET_UP
}

export async function setAi(id: number, isAi: boolean) {
  const db = boardDb()
  return db ? setArtistAi(db, id, isAi) : NOT_SET_UP
}

export async function renameArtistRow(id: number, name: string) {
  const db = boardDb()
  return db ? renameArtist(db, id, name) : NOT_SET_UP
}

export async function setArchived(id: number, archived: boolean) {
  const db = boardDb()
  return db ? setArtistArchived(db, id, archived) : NOT_SET_UP
}

export async function setFavorite(id: number, isFavorite: boolean) {
  const db = boardDb()
  return db ? setArtistFavorite(db, id, isFavorite) : NOT_SET_UP
}

export async function markRead(id: number) {
  const db = boardDb()
  return db ? markArtistRead(db, id) : NOT_SET_UP
}

export async function addUrl(artistId: number, url: string) {
  const db = boardDb()
  return db ? addArtistUrl(db, artistId, url) : NOT_SET_UP
}

export async function removeUrl(id: number) {
  const db = boardDb()
  return db ? removeArtistUrl(db, id) : NOT_SET_UP
}

/** One file onto one artist — read here rather than sent across the bridge, for the reason
 *  every upload's bytes are. */
export async function uploadArtistImage(
  artistId: number,
  path: string
): Promise<ArtistImageResult> {
  const db = boardDb()
  const store = boardStore()
  if (!db || !store) return NOT_SET_UP

  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch {
    return { ok: false, error: 'Could not read the file — has it moved?' }
  }
  return createArtistImageFromImage(db, store, bytes, artistId, DESKTOP_UPLOAD_LIMITS)
}

/** Row first, objects second — a failed delete leaves the image whole, and a failed object
 *  removal after the row is gone is untidy rather than wrong, so it is logged. */
export async function removeArtistImage(id: number) {
  const db = boardDb()
  if (!db) return NOT_SET_UP

  let gone: { file_name: string; file_ext: string } | null
  try {
    gone = await deleteArtistImageRow(db, id)
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Delete failed.' }
  }
  if (!gone) return { ok: false as const, error: 'No such image.' }
  await removeObjects(boardStore(), [gone])
  return { ok: true as const }
}

/** The artist, their addresses, their examples, and the examples' stored objects. */
export async function removeArtist(id: number) {
  const db = boardDb()
  if (!db) return NOT_SET_UP

  let gone: { file_name: string; file_ext: string }[] | null
  try {
    gone = await deleteArtistRows(db, id)
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Delete failed.' }
  }
  if (!gone) return { ok: false as const, error: 'No such artist.' }
  await removeObjects(boardStore(), gone)
  return { ok: true as const }
}

async function removeObjects(
  store: ObjectStore | null,
  gone: { file_name: string; file_ext: string }[]
): Promise<void> {
  const log = (error: unknown) => console.error('Could not remove an artist image:', error)
  if (store) {
    await Promise.all(
      gone.flatMap((image) => [
        store.remove(artistImagePath(image.file_name, image.file_ext)).catch(log),
        store.remove(artistThumbnailPath(image.file_name)).catch(log),
      ])
    )
  }
  for (const image of gone) forgetThumbnail(image.file_name)
}

export async function artistThumbnailDataUrl(fileName: string): Promise<string> {
  return cachedThumbnail(fileName, artistThumbnailPath(fileName))
}

/**
 * The stored example at full size, as a `data:` URL, for the viewer a click opens. Not
 * cached: it is one image somebody asked to look at, and holding every one ever opened
 * would be megabytes of base64 for pictures already on the bucket.
 */
export async function artistImageDataUrl(id: number): Promise<string> {
  const db = boardDb()
  if (!db) return ''
  const image = await getArtistImage(db, id)
  if (!image) return ''

  const url = boardImageUrl(artistImagePath(image.file_name, image.file_ext))
  if (!url) return ''
  try {
    const response = await fetch(url)
    if (!response.ok) return ''
    const type = response.headers.get('content-type') ?? 'image/avif'
    const bytes = Buffer.from(await response.arrayBuffer())
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return ''
  }
}
