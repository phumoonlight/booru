import { app, ipcMain } from 'electron'
import { z } from 'zod'
import { DESKTOP_UPLOAD_LIMITS } from './limits'
import { CPU_COUNT, DEFAULT_ENCODE_PRIORITY, DEFAULT_ENCODE_THREADS } from './cpu'
import { loadConfig, revealSaveFile } from './config'
import { loadPreferences, savePreferences } from './preferences'
import { listBrowsers, openUrl } from './browser'
import { setStagedState } from './close-guard'
import { exportSave, importSave } from './transfer'
import { loadSiteState, saveSiteState } from './site'
import { tagCacheStatus } from './tag-cache'
import type { AppStatus, PreferencesInput } from '../shared/api'
import type { SiteState } from '@common/data/site'

// Defaulted rather than required, so a half-filled message from the window still lands
// on something usable; `savePreferences` clamps whatever comes through here anyway.
const preferencesSchema = z.object({
  encodeThreads: z.number().optional().default(DEFAULT_ENCODE_THREADS),
  encodePriority: z
    .enum(['low', 'below-normal', 'normal'])
    .optional()
    .default(DEFAULT_ENCODE_PRIORITY),
  browser: z.string().max(500).optional().default(''),
})

// The website's maintenance switch. The message is bounded here as a ceiling and trimmed
// to 500 by `setSiteState`, which is the one that decides what a stored notice looks like
// — this only stops a pasted essay crossing the bridge.
const siteStateSchema = z.object({
  maintenance: z.boolean(),
  message: z.string().max(2000).optional().default(''),
})

const stagedStateSchema = z.object({
  staged: z.boolean(),
  uploaded: z.boolean(),
  busy: z.boolean(),
})

/** Only http(s) is ever handed to the OS — see the `shell:open-external` handler. */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** What this copy of the app is, what it is set to, and the two switches that are not
 *  about the board's contents: the website's maintenance notice, and `save.json`. */
export function registerAppIpc(): void {
  ipcMain.handle('app:status', async (): Promise<AppStatus> => {
    const config = loadConfig()
    const preferences = loadPreferences()
    return {
      configured: config !== null,
      siteUrl: config?.siteUrl ?? '',
      // The host, never the connection string — that carries a password, and the settings
      // screen is a readout somebody might screenshot. `URL.parse` returns null on
      // anything it cannot read, which for a value this build refused to be without means
      // a string shaped like no URL at all; showing nothing beats showing half of it.
      databaseHost: config ? (URL.parse(config.databaseUrl)?.hostname ?? '') : '',
      cdnUrl: config?.cdnUrl ?? '',
      // Read here rather than baked into the bundle: the renderer has no `process`, and
      // `app.getVersion()` is the version electron-builder actually stamped on the copy.
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      },
      development: !app.isPackaged,
      limits: DESKTOP_UPLOAD_LIMITS,
      tagCache: tagCacheStatus(),
      // The settings screen needs the machine's core count to bound the field it offers,
      // and what is actually in effect to show before anything has been saved.
      cpu: {
        count: CPU_COUNT,
        threads: preferences.encodeThreads,
        priority: preferences.encodePriority,
      },
      // Detected once per launch and cached, so re-reading status after every settings
      // write does not re-walk the registry.
      browser: { chosen: preferences.browser, options: await listBrowsers() },
    }
  })

  /**
   * The only settings there are. Nothing here can fail in a way worth reporting — the
   * values are clamped, not validated — so the answer is what was actually stored, and
   * the screen shows that rather than what was typed. Both take effect on the next
   * image, not the next launch, except raising the priority again on a POSIX host, which
   * `main/cpu.ts` explains.
   */
  ipcMain.handle(
    'app:save-preferences',
    async (_event, raw: unknown): Promise<PreferencesInput> => {
      const parsed = preferencesSchema.safeParse(raw)
      return savePreferences(parsed.success ? parsed.data : {})
    }
  )

  /**
   * What the upload screen holds, pushed on every change. `on`, not `handle`: nothing is
   * returned and nothing waits for it. Parsed like everything else here, and a message
   * that doesn't fit the shape is dropped rather than left to make the close dialog lie
   * about what would be lost.
   */
  ipcMain.on('upload:state', (_event, state: unknown) => {
    const parsed = stagedStateSchema.safeParse(state)
    if (parsed.success) setStagedState(parsed.data)
  })

  /**
   * The website's maintenance switch — the one thing this app writes that is about the
   * site rather than about the board's contents. `null` from the read is "couldn't ask",
   * which the settings screen draws differently from "off": off means visitors are being
   * served, and a disconnected copy must not claim that.
   */
  ipcMain.handle('site:state', async (): Promise<SiteState | null> => loadSiteState())

  ipcMain.handle('site:save', async (_event, raw: unknown) => {
    const parsed = siteStateSchema.safeParse(raw)
    if (!parsed.success) return { ok: false as const, error: 'Nothing to save' }
    return saveSiteState(parsed.data)
  })
  /**
   * `save.json` out to a file, and back in from one. Both open a picker on the main side —
   * the renderer has no filesystem and this is the only way it could name a path.
   *
   * No argument either way: what is exported is the whole file and what is imported is
   * whatever of it this build recognises, so there is nothing for the window to decide.
   * `main/transfer.ts` has why the import is section-by-section rather than a copy.
   */
  ipcMain.handle('settings:export', async () => exportSave())
  ipcMain.handle('settings:import', async () => importSave())

  /** Shows `save.json` in Explorer/Finder — the settings screen's "where is this?". */
  ipcMain.handle('shell:open-data-folder', async (): Promise<void> => revealSaveFile())

  /**
   * Only ever a post on the board. The URL ends up as an argument to a browser or as a
   * string handed to the OS, which would happily run a `file:` or a custom-scheme one, so
   * the scheme is checked rather than assumed.
   */
  ipcMain.handle('shell:open-external', async (_event, url: unknown): Promise<void> => {
    if (typeof url !== 'string') return
    if (!isWebUrl(url)) return
    await openUrl(url, loadPreferences().browser)
  })
}
