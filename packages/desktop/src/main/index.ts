import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { cleanupDownloads } from './download'
import { dropStoredConfig, dropStoredLogin, dropStoredRules } from './config'
import { configureDns } from './dns'
import { dropCache } from './app-cache'
import { openUrl } from './browser'
import { watchForeground } from './foreground'
import { applyPreferences, loadPreferences } from './preferences'

/**
 * Pubooru's desktop app: the shelves, the artist list, the tag vocabulary and the site's
 * switches, as a window.
 *
 * It began as the uploader, for one reason that still holds: an upload spends most of its
 * time in AVIF encoding, and that is CPU work a free serverless tier is billed for by the
 * second and killed at ten of them. Running it here, the ceilings the web would carry for
 * Vercel's sake go away (`main/limits.ts`), and the images and rows still land on exactly
 * the board the website reads — the pipeline is the shared file, imported, not copied.
 */

// Where the save file lives. Left alone this is the app's display name, which moves
// whenever the name on the window does, so it is spelled out instead. A checkout gets
// its own folder so a dev window and an installed copy keep their own preferences and
// tag rules — trying a rule out should not rewrite the set the app you actually use is
// working from. It goes first because the single-instance lock below is a file inside
// this folder, which is also what lets a dev window and an installed one run at once.
app.setPath(
  'userData',
  join(app.getPath('appData'), app.isPackaged ? 'pubooru-desktop' : 'pubooru-desktop-dev')
)

// One window. A second launch raises the one already open rather than starting a second
// copy against the same board, which would happily upload the same image twice.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 480,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    // The renderer paints on --background; without this the frame flashes white while
    // Chromium waits for the first paint.
    backgroundColor: '#0d0f14',
    title: 'Pubooru Desktop',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The defaults, spelled out because they are what keeps the keys out of the page:
      // the renderer gets no Node, no direct `require`, and only the bridge in preload.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // A link in the page opens in the user's browser, never in a second Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url)
      // The chosen browser, same as a link clicked in the app — `main/browser.ts`.
      if (protocol === 'https:' || protocol === 'http:')
        void openUrl(url, loadPreferences().browser)
    } catch {
      // Not a URL at all — nothing to open
    }
    return { action: 'deny' }
  })

  // electron-vite serves the renderer over http during development and writes it beside
  // the main bundle for a build.
  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void mainWindow.loadURL(devServer)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

void app.whenReady().then(() => {
  // Windows shows this as the app identity for notifications and the taskbar
  app.setAppUserModelId('dev.pubooru.postapp')
  // Before anything can be encoded: an upload at effort 9 will take every core it is
  // given, and being a good neighbour is not something to switch on after the first
  // image has already pinned the machine (`main/cpu.ts`).
  applyPreferences(loadPreferences())
  // An older version kept the project's keys in the save file. This build reads them
  // from its own bundle, so that copy is deleted rather than left lying about.
  dropStoredConfig()
  dropStoredLogin()
  // And the tag rules, which are rows on the board now — see `dropStoredRules`.
  dropStoredRules()
  // The browse grid and the AI board's tag index went with the boards (0012). Everything in
  // `app-cache` is droppable at any moment, so this is tidiness rather than a migration.
  for (const file of ['browse.json', 'browse.generative.json', 'tags.generative.json']) {
    dropCache(file)
  }
  // Before the first drag can be fetched: images come in as addresses from a browser
  // that may well resolve them over a DNS this machine does not use (`main/dns.ts`).
  configureDns()
  // Before the window exists, so its first focus is the first read of which browser was
  // in front — what "open in the last used browser" is answered from (`main/foreground.ts`).
  watchForeground()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Images fetched from a browser drag live in a temp directory for as long as the app does
app.on('will-quit', cleanupDownloads)

// macOS keeps the app alive with no windows; everywhere else closing the window is quitting
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
