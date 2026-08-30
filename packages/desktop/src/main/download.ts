import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, net } from 'electron'
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from './limits'
import { stageFiles } from './staging'
import type { StageOutcome } from '../shared/api'

/**
 * Images dragged in from a web browser.
 *
 * A drag out of Chrome or Firefox carries no file — `dataTransfer.files` is empty and
 * what actually crosses is a `text/uri-list` with the image's address. So the address is
 * what reaches here, and the bytes are fetched before anything else happens to them.
 *
 * Once downloaded they are ordinary files in a temp directory, and go through the same
 * `stageFiles` every picked file does: same format check, same limits, same preview, same
 * error shape in the queue. Nothing downstream knows the difference.
 */

const EXT_FOR_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
}

let root: string | undefined

/** One directory per run of the app, emptied on quit. */
function tempRoot(): string {
  if (!root) {
    root = join(app.getPath('temp'), `pubooru-desktop-${process.pid}`)
    mkdirSync(root, { recursive: true })
  }
  return root
}

/**
 * Best effort, and never fatal. On Windows a file another handle still holds open — a
 * preview the renderer has not let go of, an upload mid-flight, an antivirus scan — fails
 * the unlink with EPERM rather than EBUSY, and `force` only swallows ENOENT. Thrown from
 * a `will-quit` listener that is an uncaught exception, and the user's last sight of the
 * app is a crash dialog over a directory the OS clears on its own anyway. So: retry a few
 * times for the handle that is about to close, then let it go.
 */
export function cleanupDownloads(): void {
  if (!root) return
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  } catch {
    // The temp directory outlives the app this once. Not worth a dialog.
  }
}

/**
 * The name to save it under. Taken from the URL so the queue shows something
 * recognisable, stripped of anything that isn't a filename, and given an extension from
 * the response when the address had none — a CDN URL is often just an id.
 */
function fileNameFor(url: URL, contentType: string): string {
  const fromPath = decodeURIComponent(url.pathname.split('/').pop() ?? '')
  const cleaned = fromPath.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
  const base = cleaned.replace(/^\.+/, '') || 'image'
  const known = Object.values(EXT_FOR_TYPE).some((ext) => base.toLowerCase().endsWith(ext))
  return known ? base : base + (EXT_FOR_TYPE[contentType] ?? '.img')
}

async function downloadOne(address: string): Promise<StageOutcome> {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return { ok: false, path: address, name: address, error: 'Not a valid link' }
  }
  const name = url.pathname.split('/').pop() || url.hostname

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, path: address, name, error: 'Only http and https links can be fetched' }
  }

  let response: Response
  try {
    // Electron's net, not the global fetch: it goes through the app's session, so a
    // system proxy and the OS certificate store both apply.
    response = await net.fetch(url.toString())
  } catch {
    return { ok: false, path: address, name, error: 'Could not reach that link' }
  }
  if (!response.ok) {
    return { ok: false, path: address, name, error: `The server answered ${response.status}` }
  }

  // Cheap rejection: dragging a *link to a page* rather than the image itself is the
  // common mistake, and there is no reason to download a page to find that out.
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim()
  if (contentType && !contentType.startsWith('image/')) {
    return { ok: false, path: address, name, error: 'That link is not an image' }
  }

  const body = response.body
  if (!body) {
    return { ok: false, path: address, name, error: 'That link returned nothing' }
  }

  // Read with the cap applied as it goes. Trusting `content-length` would not do — it is
  // optional, and a chunked response has none at all.
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_FILE_SIZE) {
        await reader.cancel()
        return { ok: false, path: address, name, error: `Too large (max ${MAX_FILE_SIZE_LABEL})` }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, path: address, name, error: 'The download was interrupted' }
  }

  // Its own directory, so the file keeps the name it had on the web and two images
  // called `1.png` from different sites still land apart.
  const directory = join(tempRoot(), randomUUID())
  const file = join(directory, fileNameFor(url, contentType))
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(file, Buffer.concat(chunks))
  } catch {
    return { ok: false, path: address, name, error: 'Could not save the download' }
  }

  const [staged] = await stageFiles([file])
  return staged
}

/** Downloads each address and stages what came back. Sequential, like `stageFiles`. */
export async function downloadImages(addresses: string[]): Promise<StageOutcome[]> {
  const outcomes: StageOutcome[] = []
  for (const address of addresses) {
    outcomes.push(await downloadOne(address))
  }
  return outcomes
}
