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
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { boardDb } from './db'
import { boardStore } from './r2'
import { cachedImage, cachedThumbnail, forgetImage } from './image-cache'
import { logged } from './activity-log'
import { removeStoredObjects } from './stored-objects'

/**
 * The artist list, from the side that holds the keys.
 *
 * Kept apart from every other feature: nothing here touches the tag cache, the browse grid
 * or a board, because an artist is none of those. The example thumbnails share the one
 * thumbnail cache anyway — it is keyed by md5, and a name that is the hash of the bytes is
 * the same picture whichever table it came from.
 */

const NOT_SET_UP = { ok: false as const, error: 'Not set up yet' }
const NOT_FOUND_IMAGE = { ok: false as const, error: 'No such image.' }
const NOT_FOUND_ARTIST = { ok: false as const, error: 'No such artist.' }

export async function readArtists(): Promise<Artist[]> {
  const db = boardDb()
  return db ? listArtists(db) : []
}

export async function makeArtist(name: string, isAi: boolean, isFavorite: boolean) {
  const db = boardDb()
  return db
    ? logged('artist:create', { name, isAi, isFavorite }, createArtist(db, name, isAi, isFavorite))
    : NOT_SET_UP
}

export async function setAi(id: number, isAi: boolean) {
  const db = boardDb()
  return db ? logged('artist:set-ai', { id, isAi }, setArtistAi(db, id, isAi)) : NOT_SET_UP
}

export async function renameArtistRow(id: number, name: string) {
  const db = boardDb()
  return db ? logged('artist:rename', { id, name }, renameArtist(db, id, name)) : NOT_SET_UP
}

export async function setArchived(id: number, archived: boolean) {
  const db = boardDb()
  return db
    ? logged('artist:set-archived', { id, archived }, setArtistArchived(db, id, archived))
    : NOT_SET_UP
}

export async function setFavorite(id: number, isFavorite: boolean) {
  const db = boardDb()
  return db
    ? logged('artist:set-favorite', { id, isFavorite }, setArtistFavorite(db, id, isFavorite))
    : NOT_SET_UP
}

export async function markRead(id: number) {
  const db = boardDb()
  return db ? logged('artist:mark-read', { id }, markArtistRead(db, id)) : NOT_SET_UP
}

export async function addUrl(artistId: number, url: string) {
  const db = boardDb()
  return db
    ? logged('artist:add-url', { artistId, url }, addArtistUrl(db, artistId, url))
    : NOT_SET_UP
}

export async function removeUrl(id: number) {
  const db = boardDb()
  return db ? logged('artist:remove-url', { id }, removeArtistUrl(db, id)) : NOT_SET_UP
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

  const detail: Record<string, unknown> = { artistId, path }
  const upload = async (): Promise<ArtistImageResult> => {
    let bytes: Buffer
    try {
      bytes = await readFile(path)
    } catch {
      return { ok: false, error: 'Could not read the file — has it moved?' }
    }
    detail.bytes = bytes.length
    return createArtistImageFromImage(db, store, bytes, artistId, DESKTOP_UPLOAD_LIMITS)
  }
  return logged('artist:upload', detail, upload(), (result) => ({
    imageId: result.imageId,
  }))
}

/** Row first, objects second — a failed delete leaves the image whole. A failed object
 *  removal after the row is gone still answers `ok`, and is raised as a notice instead
 *  (`removeStoredObjects`). */
export async function removeArtistImage(id: number) {
  const db = boardDb()
  if (!db) return NOT_SET_UP

  const deleteRow = async () => {
    try {
      const gone = await deleteArtistImageRow(db, id)
      return gone ? { ok: true as const, gone: [gone] } : NOT_FOUND_IMAGE
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Delete failed.',
      }
    }
  }
  const deleted = await logged('artist:delete-image', { id }, deleteRow(), ({ gone }) => ({
    fileName: gone[0].file_name,
  }))
  if (!deleted.ok) return deleted
  await removeObjects(deleted.gone, 'artist:delete-image', { id })
  return { ok: true as const }
}

/** The artist, their addresses, their examples, and the examples' stored objects. */
export async function removeArtist(id: number) {
  const db = boardDb()
  if (!db) return NOT_SET_UP

  const deleteRows = async () => {
    try {
      const gone = await deleteArtistRows(db, id)
      return gone ? { ok: true as const, gone } : NOT_FOUND_ARTIST
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Delete failed.',
      }
    }
  }
  const deleted = await logged('artist:delete', { id }, deleteRows(), ({ gone }) => ({
    images: gone.map((image) => image.file_name),
  }))
  if (!deleted.ok) return deleted
  await removeObjects(deleted.gone, 'artist:delete', { id })
  return { ok: true as const }
}

async function removeObjects(
  gone: { file_name: string; file_ext: string }[],
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  await removeStoredObjects(
    boardStore(),
    gone.flatMap((image) => [
      artistImagePath(image.file_name, image.file_ext),
      artistThumbnailPath(image.file_name),
    ]),
    action,
    detail
  )
  for (const image of gone) forgetImage(image.file_name, image.file_ext)
}

export async function artistThumbnailDataUrl(fileName: string): Promise<string> {
  return cachedThumbnail(fileName, artistThumbnailPath(fileName))
}

/**
 * The stored example at full size, as a `data:` URL, for the viewer a click opens. Cached
 * on disk beside the thumbnails (`main/image-cache.ts`) — the same picture opened twice is
 * two downloads of a few megabytes otherwise, and the name is the md5 of the bytes, so a
 * file found under it is that image.
 */
export async function artistImageDataUrl(id: number): Promise<string> {
  const db = boardDb()
  if (!db) return ''
  const image = await getArtistImage(db, id)
  if (!image) return ''

  return cachedImage(
    image.file_name,
    image.file_ext,
    artistImagePath(image.file_name, image.file_ext)
  )
}
