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

const CH_PLATFORM: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

/**
 * Everything else a Chrome tab sends when it loads an image, and why all of it.
 *
 * A user agent alone is the shallow half of looking like a browser. The filters these
 * boards sit behind — Cloudflare's especially — score the whole *set*: a request claiming
 * Chrome 140 that carries no `accept-language`, no client hints and none of the
 * `sec-fetch-` metadata every real Chromium subresource carries is a mismatch, and the
 * answer is a flat 403 with nothing said about why. Chromium's own stack supplies the TLS
 * and HTTP/2 fingerprint underneath, so the headers were the only part left wrong.
 *
 * `sec-fetch-dest: image` / `mode: no-cors` is the honest description of the request:
 * bytes wanted for display, not an API call. Nothing is claimed here that the same drag
 * out of the tab it came from would not have claimed.
 */
function browserHeaders(url: URL, referer: string | undefined): Record<string, string> {
  const agent = userAgent()
  const major = /Chrome\/(\d+)/.exec(agent)?.[1] ?? '140'
  const headers: Record<string, string> = {
    'user-agent': agent,
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': `"Chromium";v="${major}", "Not=A?Brand";v="24", "Google Chrome";v="${major}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': `"${CH_PLATFORM[process.platform] ?? 'Windows'}"`,
    'sec-fetch-dest': 'image',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'none',
  }
  if (referer) {
    headers.referer = referer
    headers['sec-fetch-site'] =
      new URL(referer).origin === url.origin ? 'same-origin' : 'cross-site'
  }
  return headers
}

/**
 * A refusal is worth exactly one more ask, with the one variable there is changed.
 *
 * The image's own origin as the referer is right for a hotlink check and wrong for the
 * opposite policy — a CDN that serves anything with no referer and refuses one whose host
 * isn't on its list. Which of the two a host runs is not knowable from here, so both get
 * asked: the honest referer, then none. Only these statuses; a 404 is a 404.
 */
const RETRY_WITHOUT_REFERER = new Set([401, 403, 405, 429])

/**
 * A status the queue can act on. 403 and 429 are the two that mean "the host is fine, it
 * just won't answer *us*", and what fixes them is not something the app can do — it is
 * saving the image out of the browser it was dragged from and dropping the file. Saying
 * so beats a bare number the reader has to go and look up.
 */
function refusal(status: number): string {
  if (status === 401 || status === 403) {
    return `The server refused the download (${status}) — that host serves images only to its own pages. Save it from your browser and drop the file instead`
  }
  if (status === 429) return 'That host is rate-limiting this address (429) — try again shortly'
  if (status === 404 || status === 410) return `That link no longer points at an image (${status})`
  return `The server answered ${status}`
}

/**
 * Why the request never produced a response.
 *
 * Chromium puts a `net::ERR_…` code on the error it throws, and the codes are the
 * difference between two problems with nothing in common: a board refusing anything that
 * doesn't look like a browser, and a machine that cannot resolve the host at all. One
 * flat message made those indistinguishable. Anything unmatched keeps its code, which is
 * at least searchable.
 */
const FETCH_FAILURES: [RegExp, string][] = [
  [
    /ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/,
    'That host could not be resolved — check the address, or whether this network blocks it',
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

  // The image's own origin as the referer — a hotlink check wants to see the page the
  // image belongs to, and that is the honest answer when a drag is all we have of where
  // it came from. A host that doesn't check ignores it; one that objects gets asked again
  // with none.
  let response: Response
  try {
    // Electron's net, not the global fetch: it goes through the app's session, so a
    // system proxy and the OS certificate store both apply.
    response = await net.fetch(url.toString(), { headers: browserHeaders(url, url.origin + '/') })
    if (RETRY_WITHOUT_REFERER.has(response.status)) {
      response = await net.fetch(url.toString(), { headers: browserHeaders(url, undefined) })
    }
  } catch (cause) {
    return { ok: false, path: address, name, error: describeFailure(cause) }
  }
  if (!response.ok) {
    return { ok: false, path: address, name, error: refusal(response.status) }
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
