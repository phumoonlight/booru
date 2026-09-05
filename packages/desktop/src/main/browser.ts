import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { shell } from 'electron'
import type { BrowserChoice } from '../shared/api'

/**
 * Which browser a link out of the app opens in.
 *
 * `shell.openExternal` hands the URL to the OS, which means the machine's default
 * browser and nothing else — fine until the board is not what you want the browser you
 * live in to remember. Choosing one here bypasses the association entirely: the chosen
 * executable is launched with the URL as its argument, the way a shortcut would.
 *
 * Detection is Windows-only, this being what the app is packaged for. `StartMenuInternet`
 * is the key browsers have registered themselves under since XP, and it carries both the
 * display name and the launch command, so the list is what the Start menu would show
 * rather than a table of paths guessed from vendor names. Elsewhere the list comes back
 * empty and the OS default is the only option, which is honest — no macOS `open -a` path
 * is written here because none of it would be exercised.
 */

const run = promisify(execFile)

/**
 * Read once and kept: three `reg` processes is not much, but `app:status` is re-read
 * after every settings write, and a browser is not installed while the settings screen
 * is open. A relaunch picks up a new one.
 */
let cache: BrowserChoice[] | null = null

/** The registry views a browser can register itself in. A 64-bit host has both. */
const ROOTS: string[][] = [
  ['HKLM\\SOFTWARE\\Clients\\StartMenuInternet'],
  ['HKLM\\SOFTWARE\\Clients\\StartMenuInternet', '/reg:32'],
  ['HKCU\\SOFTWARE\\Clients\\StartMenuInternet'],
]

/** `reg` exits non-zero for a key that isn't there, which is not an error here. */
async function query(args: string[]): Promise<string> {
  try {
    const { stdout } = await run('reg', ['query', ...args], { windowsHide: true })
    return stdout
  } catch {
    return ''
  }
}

/** The first string value in `reg query` output — every read here asks for exactly one. */
function firstValue(output: string): string {
  for (const line of output.split(/\r?\n/)) {
    const at = line.indexOf('REG_SZ')
    if (at !== -1) return line.slice(at + 'REG_SZ'.length).trim()
    const expand = line.indexOf('REG_EXPAND_SZ')
    if (expand !== -1) return line.slice(expand + 'REG_EXPAND_SZ'.length).trim()
  }
  return ''
}

/**
 * `"C:\…\chrome.exe" -- "%1"` → the executable. Quoted is the normal spelling; an
 * unquoted command is taken up to `.exe`, since a bare split on spaces would cut
 * `Program Files` in half.
 */
function executableOf(command: string): string {
  const trimmed = command.trim()
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    return end === -1 ? '' : trimmed.slice(1, end)
  }
  const exe = trimmed.toLowerCase().indexOf('.exe')
  return exe === -1 ? trimmed.split(' ')[0] : trimmed.slice(0, exe + 4)
}

function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** The executable the `https:` association currently points at, or ''. */
async function defaultExecutable(): Promise<string> {
  const progId = firstValue(
    await query([
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice',
      '/v',
      'ProgId',
    ])
  )
  if (!progId) return ''
  return executableOf(firstValue(await query([`HKCR\\${progId}\\shell\\open\\command`, '/ve'])))
}

async function detect(): Promise<BrowserChoice[]> {
  if (process.platform !== 'win32') return []

  const found: BrowserChoice[] = []
  for (const [root, ...view] of ROOTS) {
    const listing = await query([root, ...view])
    for (const line of listing.split(/\r?\n/)) {
      const key = line.trim()
      // The listing repeats the root before its subkeys; only the subkeys are browsers.
      if (!key.startsWith('HKEY_') || key.length <= root.length) continue

      const path = executableOf(firstValue(await query([`${key}\\shell\\open\\command`, ...view])))
      // A browser uninstalled without cleaning up after itself leaves the key behind.
      if (!path || !existsSync(path)) continue
      // Internet Explorer is still registered on Windows 11 and still on disk, but opening
      // it hands the page to Edge — an option that does not do what it says.
      if (path.toLowerCase().endsWith('iexplore.exe')) continue
      if (found.some((browser) => samePath(browser.path, path))) continue

      found.push({
        path,
        name: firstValue(await query([key, ...view, '/ve'])) || key.slice(root.length + 1),
        isDefault: false,
      })
    }
  }

  const fallback = await defaultExecutable()
  for (const browser of found) browser.isDefault = samePath(browser.path, fallback)
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listBrowsers(): Promise<BrowserChoice[]> {
  cache ??= await detect()
  return cache
}

/**
 * Launched detached with the URL as its only argument: the app is not the browser's
 * parent for the rest of its life, and closing this window has never taken a page with
 * it. A path that no longer starts anything falls back to the OS rather than swallowing
 * the click.
 */
function launch(path: string, url: string): boolean {
  try {
    const child = spawn(path, [url], { detached: true, stdio: 'ignore', windowsHide: false })
    child.on('error', (error) => {
      console.error('Could not launch browser:', error.message)
      void shell.openExternal(url)
    })
    child.unref()
    return true
  } catch (error) {
    console.error('Could not launch browser:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * The one way a URL leaves the app. `chosen` is a stored preference and is checked
 * against what is actually installed rather than run as given — the renderer picks from
 * this list, so anything else is a hand-edited `save.json` or a browser that has since
 * been uninstalled, and both mean the OS default.
 */
export async function openUrl(url: string, chosen: string): Promise<void> {
  if (chosen) {
    const known = (await listBrowsers()).find((browser) => samePath(browser.path, chosen))
    if (known && launch(known.path, url)) return
  }
  await shell.openExternal(url)
}
