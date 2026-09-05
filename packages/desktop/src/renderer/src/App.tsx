import { useCallback, useEffect, useState } from 'react'
import { searchHref } from '@common/search'
import { About } from './components/about'
import { Browse } from './components/browse'
import { TagRules } from './components/tag-rules'
import { Settings } from './components/settings'
import { TagIndex } from './components/tag-index'
import { UploadQueue } from './components/upload-queue'
import type { AppStatus } from '../../shared/api'

/**
 * Six screens, one of them always mounted. There is no login and no setup step: which
 * board this build talks to was decided when it was built and compiled in
 * (`main/config.ts`), and the board itself has no accounts any more — this app writes
 * with the service-role key in its own bundle, which is why it is the only thing that
 * can. The window opens on the queue.
 *
 * Settings is forced open in one case only: a bundle built without those values, which
 * the build itself refuses to produce. About is the other exception to the screen order —
 * it answers "what am I running", a fair question of a copy that cannot reach its board
 * at all.
 */
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [view, setView] = useState<
    'upload' | 'browse' | 'tags' | 'rules' | 'settings' | 'about'
  >('upload')

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
  // build carries no project — it is the screen that says so.
  const over =
    view === 'about' ? (
      <About status={status} />
    ) : !status.configured || view === 'settings' ? (
      // `onChanged` refreshes the status the compression rows are seeded from; nothing
      // on this screen can change which board the app talks to.
      <Settings status={status} onChanged={() => void refresh()} />
    ) : view === 'browse' ? (
      <Browse siteUrl={status.siteUrl} />
    ) : view === 'tags' ? (
      <TagIndex siteUrl={status.siteUrl} />
    ) : view === 'rules' ? (
      <TagRules siteUrl={status.siteUrl} />
    ) : null

  const toggle = (target: typeof view) => () =>
    setView((current) => (current === target ? 'upload' : target))

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        {/*
          The board itself, in the corner the web's wordmark occupies — this window is a
          way of putting things on that site, and the site is the thing it belongs to.
          Never drawn active: it opens in the browser, so a tab bar under it would claim
          you were somewhere this window cannot be. `searchHref('')` rather than a literal
          '/posts', which is the web's own rule about which file spells that path. An
          empty slot when the build carries no site URL, rather than a dead heading.
        */}
        {status.siteUrl ? (
          <button
            type="button"
            onClick={() => void window.api.openExternal(`${status.siteUrl}${searchHref('')}`)}
            title="Open the board in your browser"
            className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-muted transition-colors hover:text-foreground"
          >
            <span aria-hidden>🖼️</span>
            Open site
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {/* The queue, and the way back to it from every other screen — the one item
              here that is the app's actual job, so it leads the row. */}
          <button
            type="button"
            onClick={() => setView('upload')}
            className={navClass(view === 'upload')}
          >
            <span aria-hidden>📤</span>
            Upload
          </button>
          {/* Next to Upload because it is the other half of the same job: this window
              puts posts on the board, and this is where it changes the ones already
              there. The website cannot — it holds a key that only reads. */}
          <button
            type="button"
            onClick={toggle('browse')}
            title="Find a post and edit or delete it"
            className={navClass(view === 'browse')}
          >
            <span aria-hidden>🔍</span>
            Browse
          </button>
          <button type="button" onClick={toggle('tags')} className={navClass(view === 'tags')}>
            <span aria-hidden>🏷️</span>
            Tags
          </button>
          {/* Beside Tags because it is about tags, and because the two answer the same
              question from opposite ends: what does the board call this, and what should
              this one drag in with it. */}
          <button
            type="button"
            onClick={toggle('rules')}
            title="Tags that bring other tags with them"
            className={navClass(view === 'rules')}
          >
            <span aria-hidden>🔗</span>
            Tag rules
          </button>
          <button type="button" onClick={toggle('about')} className={navClass(view === 'about')}>
            <span aria-hidden>ℹ️</span>
            About
          </button>
          <button
            type="button"
            onClick={toggle('settings')}
            className={navClass(view === 'settings' || !status.configured)}
          >
            <span aria-hidden>⚙️</span>
            Settings
          </button>
        </div>
      </header>

      {/* The frame never scrolls; the queue inside it does */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {over}

        {/*
          The queue is hidden rather than unmounted. Staging a dozen images, tagging half
          of them and then glancing at About used to throw all of it away — and an upload
          already in flight lost the component waiting for its answer.
        */}
        {status.configured && (
          <div
            className={
              over ? 'hidden' : 'mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-4'
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
