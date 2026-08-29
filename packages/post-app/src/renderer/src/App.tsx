import { useCallback, useEffect, useState } from 'react'
import { Login } from './components/login'
import { Settings } from './components/settings'
import { UploadQueue } from './components/upload-queue'
import { SettingsIcon } from './components/icons'
import type { AppStatus } from '../../shared/api'

/**
 * Three screens, picked by what the app knows: settings until it has a project to talk
 * to, login until someone is signed in, then the queue. The same order the website
 * enforces — `<SetupNotice />`, then the redirect to /login, then /upload — except here
 * the first one is a form rather than a runbook, because a packaged app has no
 * `.env.local` to edit.
 */
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [editingSettings, setEditingSettings] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await window.api.getStatus())
  }, [])

  // The first read is a subscription to something outside React — the main process —
  // not a state sync, so the answer sets state from the callback rather than the effect
  // body, and a window closed mid-answer is left alone.
  useEffect(() => {
    let alive = true
    void window.api.getStatus().then((next) => {
      if (alive) setStatus(next)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!status) {
    return <div className="grid h-screen place-items-center text-sm text-muted">Starting…</div>
  }

  const screen = () => {
    if (!status.configured || editingSettings) {
      return (
        <Settings
          encryptedAtRest={status.encryptedAtRest}
          canCancel={status.configured}
          onSaved={() => {
            setEditingSettings(false)
            void refresh()
          }}
          onCancel={() => setEditingSettings(false)}
        />
      )
    }

    if (!status.user) {
      return <Login onSignedIn={refresh} onSettings={() => setEditingSettings(true)} />
    }

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
        <h1 className="text-lg font-bold tracking-tight">Upload</h1>
        <UploadQueue status={status} />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-sm font-bold tracking-tight">Pubooru Uploader</span>
        <div className="flex items-center gap-2">
          {status.user && (
            <>
              <span className="text-xs text-muted">{status.user.username}</span>
              <button
                type="button"
                onClick={() => void window.api.logOut().then(refresh)}
                className="min-h-9 rounded-lg border border-border px-3 text-xs"
              >
                Log out
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditingSettings((open) => !open)}
            title="Connection settings"
            aria-label="Connection settings"
            className="flex min-h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* The frame never scrolls; the queue inside it does */}
      <main className="min-h-0 flex-1 overflow-y-auto">{screen()}</main>
    </div>
  )
}
