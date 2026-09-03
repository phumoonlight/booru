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

/**
 * The user agent to ask with, and why it is not Electron's own.
 *
 * Electron advertises `… Chrome/140.0.0.0 Pubooru/1.0.4 Electron/44.0.0 Safari/537.36`,
 * and those two extra tokens are exactly what a hotlink or bot filter matches on: a board
 * that serves the image to the browser it was dragged out of resets the connection for
 * this, which surfaces as a failure with no HTTP status at all. Removing the tokens
 * leaves the genuine Chromium string for the version actually running — truer than a
 * pinned literal here, which would go stale against the runtime a version later.
 */
let browserAgent: string | undefined

function userAgent(): string {
  if (!browserAgent) {
    const own = app.getName().toLowerCase()
    browserAgent = app.userAgentFallback
      .split(' ')
      .filter((token) => {
        const product = token.split('/')[0].toLowerCase()
        return product !== 'electron' && product !== own
      })
      .join(' ')
  }
  return browserAgent
}

/**
 * Why the request never produced a response.
 *
 * Chromium puts a `net::ERR_…` code on the error it throws, and the codes are the
 * difference between two problems with nothing in common: a board refusing anything that
 * doesn't look like a browser, and a machine that cannot resolve the host at all — the
 * second being what a browser hides by resolving over DNS-over-HTTPS while this app uses
 * the OS resolver. One flat message made those indistinguishable. Anything unmatched
 * keeps its code, which is at least searchable.
 */
const FETCH_FAILURES: [RegExp, string][] = [
  [
    /ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/,
    'That host could not be resolved — your browser may reach it over a DNS this app does not use',
  ],
  [/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/, 'No network connection'],
  [/ERR_(?:CONNECTION_)?TIMED_OUT/, 'The server did not answer in time'],
  [
    /ERR_CONNECTION_(?:RESET|CLOSED|ABORTED|REFUSED|FAILED)|ERR_EMPTY_RESPONSE/,
    'The server closed the connection — it may be refusing anything but a browser',
  ],
  [/ERR_CERT|ERR_SSL|ERR_TLS/, "That site's certificate was rejected"],
  [/ERR_BLOCKED_BY/, 'Something on this machine blocked the request'],
]

function describeFailure(cause: unknown): string {
  const parts: string[] = []
  for (let error = cause; error instanceof Error; error = error.cause) parts.push(error.message)
  const text = parts.join(' ')
  for (const [pattern, message] of FETCH_FAILURES) if (pattern.test(text)) return message
  const code = /net::[A-Z_]+/.exec(text)?.[0]
  return code ? `Could not reach that link (${code})` : 'Could not reach that link'
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
    response = await net.fetch(url.toString(), {
      headers: {
        'user-agent': userAgent(),
        // The image's own origin as the referer — a hotlink check wants to see the page
        // the image belongs to, and that is the honest answer when a drag is all we have
        // of where it came from. A host that doesn't check ignores it.
        referer: url.origin + '/',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })
  } catch (cause) {
    return { ok: false, path: address, name, error: describeFailure(cause) }
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
