import { useCallback, useEffect, useState } from 'react'
import { About } from './components/about'
import { Artists } from './components/artists'
import { Collections } from './components/collections'
import { Logs } from './components/logs'
import { Notices } from './components/notices'
import { Settings } from './components/settings'
import { TagIndex } from './components/tag-index'
import type { AppStatus } from '../../shared/api'

/**
 * Six screens, five of them in the header — Tags is kept but no longer offered. There is no
 * login and no setup step: which board this build talks to was decided when it was built
 * and compiled in (`main/config.ts`), and the board itself has no accounts — this app writes
 * with the login in its own bundle, which is why it is the only thing that can. The window
 * opens on the shelves.
 *
 * Settings is forced open in one case only: a bundle built without those values, which
 * the build itself refuses to produce. About is the other exception to the screen order —
 * it answers "what am I running", a fair question of a copy that cannot reach its board
 * at all.
 *
 * There was an Upload screen, a Browse screen and a board switch in the header, for the
 * gallery and the generated images. Both boards were moved onto shelves (0012), and with
 * them went everything here that was about a post.
 */
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [view, setView] = useState<
    'collections' | 'artists' | 'tags' | 'logs' | 'settings' | 'about'
  >('collections')

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

  // Settings is forced open only when the build carries no project — it is the screen
  // that says so.
  const screen =
    view === 'about' ? (
      <About status={status} />
    ) : !status.configured || view === 'settings' ? (
      // `onChanged` refreshes the status the compression rows are seeded from; nothing
      // on this screen can change which board the app talks to.
      <Settings status={status} onChanged={() => void refresh()} />
    ) : view === 'collections' ? (
      <Collections siteUrl={status.siteUrl} />
    ) : view === 'artists' ? (
      <Artists />
    ) : view === 'logs' ? (
      <Logs />
    ) : (
      <TagIndex />
    )

  /**
   * The only thing a nav item does. Pressing the one you were already on does nothing,
   * so the header's own answer to "where am I" is never also a way of leaving.
   */
  const go = (target: typeof view) => () => setView(target)

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        {/*
          The site itself, in the corner the web's wordmark occupies — this window is a way
          of putting things on that site, and the site is the thing it belongs to. Never
          drawn active: it opens in the browser, so a tab bar under it would claim you were
          somewhere this window cannot be. `/posts` is the website's newest images across
          every shelf. An empty slot when the build carries no site URL, rather than a dead
          heading.
        */}
        <div className="flex min-w-0 items-center gap-3">
          {status.siteUrl ? (
            <button
              type="button"
              onClick={() => void window.api.openExternal(`${status.siteUrl}/posts`)}
              title="Open the site in your browser"
              className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-muted transition-colors hover:text-foreground"
            >
              <span aria-hidden>🖼️</span>
              Open site
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* The shelves lead the row: they are what the website shows, and the only images
              this window puts there. */}
          <button
            type="button"
            onClick={go('collections')}
            title="The shelves the site shows"
            className={navClass(view === 'collections')}
          >
            <span aria-hidden>🗂️</span>
            Collections
          </button>
          {/* A reading list, not a place images are put on the site: nothing in it reaches
              the website and nothing in it has a tag. */}
          <button
            type="button"
            onClick={go('artists')}
            title="Artists to go back to, the longest unread first"
            className={navClass(view === 'artists')}
          >
            <span aria-hidden>🎨</span>
            Artists
          </button>
          {/* No Tags item: the vocabulary, its rules and the form's rows are kept for a later
              use now that nothing carries a tag, and `TagIndex` still renders for `'tags'` —
              only the way to it is hidden. A shelf's own tags are on the shelf. */}
          {/* What this copy has done to the board, and what failed — `main/activity-log.ts`. */}
          <button type="button" onClick={go('logs')} className={navClass(view === 'logs')}>
            <span aria-hidden>📜</span>
            Logs
          </button>
          <button type="button" onClick={go('about')} className={navClass(view === 'about')}>
            <span aria-hidden>ℹ️</span>
            About
          </button>
          <button
            type="button"
            onClick={go('settings')}
            className={navClass(view === 'settings' || !status.configured)}
          >
            <span aria-hidden>⚙️</span>
            Settings
          </button>
        </div>
      </header>

      {/* The frame never scrolls; the screen inside it does.

          Every screen inside carries `pb-25` — 100px of nothing under its last row. A
          scroller that ends flush with the window makes the last item look cut off rather
          than final, and there is nowhere left to put the pointer. It is on each screen
          rather than here because `py-*` is `padding-block` and `pb-*` is
          `padding-bottom`: two properties setting the same value, decided by whichever
          lands later in the stylesheet, so the shorthand is split instead of overridden. */}
      <main className="min-h-0 flex-1 overflow-y-auto">{screen}</main>
      <Notices />
    </div>
  )
}
