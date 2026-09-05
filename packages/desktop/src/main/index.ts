import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { registerIpc } from './ipc'
import { cleanupDownloads } from './download'
import { dropStoredConfig, dropStoredLogin } from './config'
import { configureDns } from './dns'
import { confirmClose, queueIsWorthKeeping } from './queue-guard'
import { applyPreferences, loadPreferences } from './preferences'

/**
 * Pubooru's uploader, as a desktop window.
 *
 * It exists for one reason: the upload path spends most of its time in AVIF encoding and
 * a lossy AVIF thumbnail, and that is CPU work a free serverless tier is billed for by
 * the second and killed at ten of them. Running it here, the 4MB/20MP ceilings the web
 * carries for Vercel's sake go away (`main/limits.ts`), and the images and rows still
 * land in exactly the same Supabase project — the pipeline is the web's own file,
 * imported, not copied.
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
// uploader against the same board, which would happily create the same post twice.
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

  /**
   * Closing with images still staged asks first (`main/queue-guard.ts`). The veto has to
   * be synchronous — a `close` handler that awaits has already let the window go — so the
   * close is cancelled outright and re-issued, as a `destroy`, only if the answer is yes.
   * `asking` is what stops a second × while the dialog is up from stacking another.
   */
  let asking = false
  mainWindow.on('close', (event) => {
    const window = mainWindow
    if (!window || !queueIsWorthKeeping()) return
    event.preventDefault()
    if (asking) return
    asking = true
    void confirmClose(window)
      .then((confirmed) => {
        // Destroy, not close: this is past the question, and going through `close` again
        // would only ask it a second time.
        if (confirmed) window.destroy()
      })
      .finally(() => {
        asking = false
      })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // A link in the page opens in the user's browser, never in a second Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url)
      if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
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
  // Before the first drag can be fetched: images come in as addresses from a browser
  // that may well resolve them over a DNS this machine does not use (`main/dns.ts`).
  configureDns()
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
