import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { registerIpc } from './ipc'
import { cleanupDownloads } from './download'

/**
 * Pubooru's uploader, as a desktop window.
 *
 * It exists for one reason: the upload path spends most of its time in lossless AVIF and
 * a lossy AVIF thumbnail, and that is CPU work a free serverless tier is billed for by
 * the second and killed at ten of them. Running it here, the 4MB/20MP ceilings the web
 * carries for Vercel's sake go away (`main/limits.ts`), and the images and rows still
 * land in exactly the same Supabase project — the pipeline is the web's own file,
 * imported, not copied.
 */

// Where the save file lives. Left alone this is the app's display name, which moves
// whenever the name on the window does, so it is spelled out instead. A checkout gets
// its own folder: since the settings screen became the only way config gets in, dev and
// an installed copy would otherwise share one save.json — and testing the setup or login
// flow means overwriting the keys and session of the app you actually use. It goes first
// because the single-instance lock below is a file inside this folder, which is also
// what lets a dev window and an installed one run at the same time.
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
