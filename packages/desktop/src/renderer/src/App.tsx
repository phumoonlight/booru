import { useCallback, useEffect, useState } from 'react'
import { About } from './components/about'
import { AccountMenu } from './components/account-menu'
import { Login } from './components/login'
import { Settings } from './components/settings'
import { UploadQueue } from './components/upload-queue'
import type { AppStatus } from '../../shared/api'

/**
 * Three screens, picked by what the app knows: settings until it has a project to talk
 * to, login until someone is signed in, then the queue. The same order the website
 * enforces — `<SetupNotice />`, then the redirect to /login, then /upload — except here
 * the first one is a form rather than a runbook: this app reads no environment, so the
 * four values are typed in wherever it runs.
 *
 * About is the exception to that order rather than a fourth step: it answers "what am I
 * running", which is a fair question before the app is set up at all, so it is the one
 * view allowed to sit in front of an unconfigured window.
 */
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [view, setView] = useState<'upload' | 'settings' | 'about'>('upload')

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

  // Which screen you are on, said in the header rather than left to be inferred from
  // what is below it — About and settings look alike from the corner of an eye.
  //
  // The bar is a pseudo-element, not text-decoration: an underline is drawn per run of
  // text, so the gap between an item's emoji and its label came out as a gap in the
  // line. `-bottom-2` is the header's own `py-2`, which lands the bar on its border and
  // makes the current item read as a tab rather than a visited link.
  const ACTIVE_BAR =
    'relative after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:bg-accent'

  const navClass = (active: boolean) =>
    `flex items-center gap-1 text-xs transition-colors ${
      active ? `text-foreground ${ACTIVE_BAR}` : 'text-muted hover:text-foreground'
    }`

  const screen = () => {
    if (view === 'about') return <About status={status} />

    if (!status.configured || view === 'settings') {
      return (
        <Settings
          canCancel={status.configured}
          onSaved={() => {
            setView('upload')
            void refresh()
          }}
          onCancel={() => setView('upload')}
        />
      )
    }

    if (!status.user) {
      return <Login onSignedIn={refresh} />
    }

    // The empty drop zone is the whole screen's content, so it sits in the middle of it
    // rather than hugging the header. `my-auto` rather than `justify-center`: once the
    // queue is taller than the window the auto margins collapse to zero, where centring
    // would push the first rows off the top of a scroller, out of reach.
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-4">
        <div className="my-auto">
          <UploadQueue status={status} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        {/*
          The OS titlebar already says Pubooru Desktop, so repeating it here was the name
          twice over. It names the screen instead — the app's only page — and doubles as
          the way back from settings, the way the web's wordmark returns you to the board.
          Signed out there is no such screen to name, and the corner opposite says Log in
          instead; an empty slot is left rather than a link to a queue you cannot reach.
        */}
        {status.user ? (
          <button
            type="button"
            onClick={() => setView('upload')}
            className={`text-sm font-bold tracking-tight transition-colors ${
              view === 'upload' ? ACTIVE_BAR : 'text-muted hover:text-foreground'
            }`}
          >
            Upload
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView((current) => (current === 'about' ? 'upload' : 'about'))}
            className={navClass(view === 'about')}
          >
            <span aria-hidden>ℹ️</span>
            About
          </button>
          <button
            type="button"
            onClick={() => setView((current) => (current === 'settings' ? 'upload' : 'settings'))}
            className={navClass(view === 'settings' || !status.configured)}
          >
            <span aria-hidden>⚙️</span>
            Connection settings
          </button>
          {/* Signed out, the same corner says so and goes back to the form — from About
              or settings there was otherwise nothing naming the way to it. */}
          {!status.user && (
            <button
              type="button"
              onClick={() => setView('upload')}
              className={navClass(view === 'upload')}
            >
              <span aria-hidden>👤</span>
              Log in
            </button>
          )}
          {status.user && (
            <AccountMenu
              username={status.user.username}
              siteUrl={status.siteUrl}
              onLogOut={() =>
                void window.api.logOut().then(() => {
                  // About and settings both sit in front of the login check, so logging
                  // out from either left the window on a screen for a session that no
                  // longer exists. Signing out ends whatever you were doing.
                  setView('upload')
                  return refresh()
                })
              }
            />
          )}
        </div>
      </header>

      {/* The frame never scrolls; the queue inside it does */}
      <main className="min-h-0 flex-1 overflow-y-auto">{screen()}</main>
    </div>
  )
}
