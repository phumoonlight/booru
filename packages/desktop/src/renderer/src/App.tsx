import { useCallback, useEffect, useState } from 'react'
import { searchHref } from '@web/lib/search'
import { About } from './components/about'
import { AccountMenu } from './components/account-menu'
import { Login } from './components/login'
import { Settings } from './components/settings'
import { TagIndex } from './components/tag-index'
import { UploadQueue } from './components/upload-queue'
import type { AppStatus } from '../../shared/api'

/**
 * Screens picked by what the app knows: login until someone is signed in, then the
 * queue. There is no setup step any more — which board this build talks to was decided
 * when it was built and compiled in (`main/config.ts`), so the app opens on a login form
 * and nothing else is ever asked for. Settings is forced open in one case only: a bundle
 * built without those values, which the build itself refuses to produce.
 *
 * About is the exception to that order: it answers "what am I running", which is a fair
 * question before the app is set up at all, so it is the one view allowed to sit in
 * front of an unconfigured window. Tags is not — it reads the board, so it sits behind
 * the session with the queue.
 */
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [view, setView] = useState<'upload' | 'tags' | 'settings' | 'about'>('upload')

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

  // Anything that takes the window off the queue. Settings is forced open only when the
  // build carries no project — it is the screen that says so — and the login form until
  // someone is signed in.
  const over =
    view === 'about' ? (
      <About status={status} />
    ) : !status.configured || view === 'settings' ? (
      // `onChanged` refreshes the status the compression rows are seeded from; nothing
      // on this screen can change which board the app talks to any more.
      <Settings status={status} onChanged={() => void refresh()} />
    ) : !status.user ? (
      <Login onSignedIn={refresh} />
    ) : view === 'tags' ? (
      <TagIndex siteUrl={status.siteUrl} />
    ) : null

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
          {/* The gallery this app uploads into, opened in the browser — there is no
              grid in this window, and following a post from the queue already works
              that way. Never marked active: it is a link out, not a view, so the tab
              bar under the others would be a lie about where you are. `searchHref('')`
              rather than a literal '/posts', which is the web's own rule about which
              file is allowed to spell that path. */}
          {status.siteUrl && (
            <button
              type="button"
              onClick={() => void window.api.openExternal(`${status.siteUrl}${searchHref('')}`)}
              title="Open the board's gallery in your browser"
              className={navClass(false)}
            >
              <span aria-hidden>🖼️</span>
              Posts
            </button>
          )}
          {status.user && (
            <button
              type="button"
              onClick={() => setView((current) => (current === 'tags' ? 'upload' : 'tags'))}
              className={navClass(view === 'tags')}
            >
              <span aria-hidden>🏷️</span>
              Tags
            </button>
          )}
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
            Settings
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
      <main className="min-h-0 flex-1 overflow-y-auto">
        {over}

        {/*
          The queue is hidden rather than unmounted. Staging a dozen images, tagging half
          of them and then glancing at About used to throw all of it away — and an upload
          already in flight lost the component waiting for its answer. It only exists
          while there is a session to upload with, so logging out still clears it.
        */}
        {status.configured && status.user && (
          <div
            className={
              over
                ? 'hidden'
                : 'mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-4'
            }
          >
            {/* The empty drop zone is the whole screen's content, so it sits in the
                middle of it rather than hugging the header. `my-auto` rather than
                `justify-center`: once the queue is taller than the window the auto
                margins collapse to zero, where centring would push the first rows off
                the top of a scroller, out of reach. */}
            <div className="my-auto">
              <UploadQueue status={status} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
