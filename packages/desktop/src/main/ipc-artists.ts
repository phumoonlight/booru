import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  addUrl,
  artistImageDataUrl,
  artistThumbnailDataUrl,
  makeArtist,
  markRead,
  readArtists,
  removeArtist,
  removeArtistImage,
  removeUrl,
  renameArtistRow,
  setAi,
  setArchived,
  uploadArtistImage,
} from './artists'
import { postIdSchema } from './ipc-parse'
import type { Artist } from '@common/data/artists'

/** Bounded here, settled inside by `readArtistName` / `readArtistUrl`. */
const textSchema = z.string().max(1000)

const NO_ARTIST = { ok: false as const, error: 'No such artist' }

/** The artist list. None of these takes a board: an artist is not about one. */
export function registerArtistIpc(): void {
  ipcMain.handle('artists:list', async (): Promise<Artist[]> => readArtists())

  ipcMain.handle('artists:create', async (_event, name: unknown, isAi: unknown) => {
    const parsed = textSchema.safeParse(name)
    if (!parsed.success) return { ok: false as const, error: 'Type a name.' }
    // Absent is a person, which is what the screen opens on; anything present and not a
    // boolean is a bug in the window rather than a choice.
    return makeArtist(parsed.data, z.boolean().optional().default(false).parse(isAi))
  })

  ipcMain.handle('artists:set-ai', async (_event, id: unknown, isAi: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsedAi = z.boolean().safeParse(isAi)
    if (!parsedId.success) return NO_ARTIST
    if (!parsedAi.success) return { ok: false as const, error: 'AI or not?' }
    return setAi(parsedId.data, parsedAi.data)
  })

  ipcMain.handle('artists:rename', async (_event, id: unknown, name: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsedName = textSchema.safeParse(name)
    if (!parsedId.success) return NO_ARTIST
    if (!parsedName.success) return { ok: false as const, error: 'Type a name.' }
    return renameArtistRow(parsedId.data, parsedName.data)
  })

  ipcMain.handle('artists:set-archived', async (_event, id: unknown, archived: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsedArchived = z.boolean().safeParse(archived)
    if (!parsedId.success) return NO_ARTIST
    if (!parsedArchived.success) return { ok: false as const, error: 'Archive or not?' }
    return setArchived(parsedId.data, parsedArchived.data)
  })

  ipcMain.handle('artists:mark-read', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success ? markRead(parsed.data) : NO_ARTIST
  })

  ipcMain.handle('artists:delete', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success ? removeArtist(parsed.data) : NO_ARTIST
  })

  ipcMain.handle('artists:add-url', async (_event, id: unknown, url: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsedUrl = textSchema.safeParse(url)
    if (!parsedId.success) return NO_ARTIST
    if (!parsedUrl.success) return { ok: false as const, error: 'That address is too long.' }
    return addUrl(parsedId.data, parsedUrl.data)
  })

  ipcMain.handle('artists:remove-url', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success
      ? removeUrl(parsed.data)
      : { ok: false as const, error: 'No such address' }
  })

  ipcMain.handle('artists:upload', async (_event, id: unknown, path: unknown) => {
    const parsedId = postIdSchema.safeParse(id)
    const parsedPath = z.string().min(1).safeParse(path)
    if (!parsedId.success) return NO_ARTIST
    if (!parsedPath.success) return { ok: false as const, error: 'Nothing to upload' }
    return uploadArtistImage(parsedId.data, parsedPath.data)
  })

  ipcMain.handle('artists:delete-image', async (_event, id: unknown) => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success
      ? removeArtistImage(parsed.data)
      : { ok: false as const, error: 'No such image' }
  })

  ipcMain.handle('artists:thumbnail', async (_event, fileName: unknown): Promise<string> => {
    const parsed = z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .safeParse(fileName)
    return parsed.success ? artistThumbnailDataUrl(parsed.data) : ''
  })

  ipcMain.handle('artists:image', async (_event, id: unknown): Promise<string> => {
    const parsed = postIdSchema.safeParse(id)
    return parsed.success ? artistImageDataUrl(parsed.data) : ''
  })
}
