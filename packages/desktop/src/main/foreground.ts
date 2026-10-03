import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'

/**
 * Which programs are in front, most recently used first.
 *
 * "Open this in the browser I was just in" needs one fact the OS does not volunteer: the
 * order of the top-level windows on the desktop. Windows keeps that as the z-order, which
 * is activation order — the window on top is the one used last — and by the time a link
 * is clicked the window on top is this app, with the browser the person came from directly
 * under it. So the order is read whenever this app comes to the front, not when a link is
 * clicked, and `openUrl` looks at what was read.
 *
 * Electron has no API for other programs' windows, and the user32 calls that answer it need
 * a native bridge. Rather than add an FFI package to the installer, a PowerShell process is
 * kept running with the P/Invoke declarations compiled once, and asked again on every focus
 * — the `reg` queries in `main/browser.ts` are the same bargain, minus the keeping. A
 * launch costs a second or two for the compile, which is why the process is kept rather
 * than spawned per question: alt-tab is frequent, and the first click after launch is far
 * later than the first focus.
 *
 * Windows-only, like the browser detection. Elsewhere there is nothing to watch and the
 * list is empty.
 */

/**
 * Every visible, uncloaked, titled top-level window from the top of the z-order down,
 * reduced to its owner's executable, one line each, then a `--` line. Cloaked windows are
 * what Windows 11 keeps for UWP apps and minimised Store apps — top-level, "visible", and
 * drawn nowhere — and an untitled visible window is a tooltip or a tray host, never the
 * window somebody was working in. One line per process rather than per window: a browser
 * with ten windows is one browser.
 */
const SCRIPT = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Z {
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
}
'@
while ($null -ne [Console]::In.ReadLine()) {
  $seen = @{}
  $h = [Z]::GetTopWindow([IntPtr]::Zero)
  while ($h -ne [IntPtr]::Zero) {
    if ([Z]::IsWindowVisible($h) -and [Z]::GetWindowTextLength($h) -gt 0) {
      $cloaked = 0
      [void][Z]::DwmGetWindowAttribute($h, 14, [ref]$cloaked, 4)
      if ($cloaked -eq 0) {
        $owner = [uint32]0
        [void][Z]::GetWindowThreadProcessId($h, [ref]$owner)
        if (-not $seen.ContainsKey($owner)) {
          $seen[$owner] = $true
          try {
            $p = Get-Process -Id $owner -ErrorAction Stop
            if ($p.Path) { [Console]::Out.WriteLine($p.Path) }
          } catch {}
        }
      }
    }
    $h = [Z]::GetWindow($h, 2)
  }
  [Console]::Out.WriteLine('--')
  [Console]::Out.Flush()
}
`

/** A question the helper has not answered in this long is a helper to replace. */
const ANSWER_TIMEOUT = 5_000

let helper: ChildProcess | null = null
let buffered = ''
let waiting: ((paths: string[]) => void) | null = null

/** The order last read, and the read in flight if one is — a click awaits that one. */
let latest: string[] = []
let pending: Promise<string[]> | null = null

function stopHelper(): void {
  helper?.kill()
  helper = null
  buffered = ''
  waiting?.([])
  waiting = null
}

function startHelper(): ChildProcess {
  // `-EncodedCommand` carries the script whole; quoting a multi-line here-string through
  // Windows' argument parsing is a thing to avoid, not get right.
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(SCRIPT, 'utf16le').toString('base64'),
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
  )
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffered += chunk
    const lines = buffered.split(/\r?\n/).map((line) => line.trim())
    const end = lines.indexOf('--')
    if (end === -1) return
    buffered = lines.slice(end + 1).join('\n')
    waiting?.(lines.slice(0, end).filter(Boolean))
    waiting = null
  })
  child.on('error', () => stopHelper())
  child.on('exit', () => {
    if (helper === child) stopHelper()
  })
  return child
}

/** One round trip. Two focus events in a row share the read rather than queueing a second. */
function read(): Promise<string[]> {
  if (pending) return pending
  pending = new Promise<string[]>((resolve) => {
    helper ??= startHelper()
    const timer = setTimeout(() => {
      // Not answering is the only failure it has: the helper is replaced on the next ask.
      stopHelper()
    }, ANSWER_TIMEOUT)
    waiting = (paths) => {
      clearTimeout(timer)
      resolve(paths)
    }
    helper.stdin?.write('\n')
  }).then((paths) => {
    // An empty answer is a failed read, not an empty desktop — this app is always on it.
    if (paths.length > 0) latest = paths
    pending = null
    return latest
  })
  return pending
}

/**
 * Read the order whenever this app comes to the front, which is the only moment the
 * browser somebody was just in is reliably the window under it. Called once, at startup.
 */
export function watchForeground(): void {
  if (process.platform !== 'win32') return
  app.on('browser-window-focus', () => void read())
  app.on('will-quit', () => stopHelper())
}

/**
 * Executables with a window on screen, most recently used first. What was read at the
 * last focus, or the read in flight if the click came that quickly after it — a stale
 * answer is the one browser this is here to avoid.
 */
export function foregroundExecutables(): Promise<string[]> {
  if (process.platform !== 'win32') return Promise.resolve([])
  return pending ?? Promise.resolve(latest)
}
