import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { stageFiles } from './staging'
import { downloadImages } from './download'

/**
 * Where a batch of files is being staged to — the only thing the duplicate check needs to
 * tell apart. See `StageTarget`.
 */
const stageTargetSchema = z.enum(['collection', 'artist'])

/** Picking images and staging them: what a shelf and an artist's examples share before
 *  either uploads anything. */
export function registerFileIpc(): void {
  ipcMain.handle('files:choose', async (event): Promise<string[]> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'] }],
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('files:stage', async (_event, paths: unknown, target: unknown) => {
    const parsed = z.array(z.string().min(1)).max(200).safeParse(paths)
    const on = stageTargetSchema.safeParse(target)
    // The target is here because staging asks the duplicate question, and where it is
    // asked decides the answer: the same bytes on a shelf are one image wherever it is
    // shelved, and the same bytes on an artist are one example whoever holds it.
    return parsed.success && on.success ? stageFiles(parsed.data, on.data) : []
  })

  /**
   * Images dragged in from a browser arrive as links, not files — see `main/download.ts`.
   * The addresses come from a page, so they are parsed as URLs before anything fetches
   * them, and the handler answers in the same shape `files:stage` does.
   */
  ipcMain.handle('files:fetch', async (_event, urls: unknown, target: unknown) => {
    const parsed = z.array(z.url()).max(50).safeParse(urls)
    const on = stageTargetSchema.safeParse(target)
    return parsed.success && on.success ? downloadImages(parsed.data, on.data) : []
  })
}
