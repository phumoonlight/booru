import { useCallback, useEffect, useState } from 'react'
import { BOARDS } from '@common/board'
import { searchHref } from '@common/search'
import { BOARD_EMOJI, boardLabel, setBoard, useBoard } from './board-store'
import { About } from './components/about'
import { SEGMENTS, segment } from './components/buttons'
import { Browse } from './components/browse'
import { browseFor, hydrateBrowseCache } from './components/browse-store'
import { Collections } from './components/collections'
import { Settings } from './components/settings'
import { TagIndex } from './components/tag-index'
import { UploadForm } from './components/upload-form'
import type { AppStatus } from '../../shared/api'

/**
 * Six screens, one of them always mounted. There is no login and no setup step: which
 * board this build talks to was decided when it was built and compiled in
 * (`main/config.ts`), and the board itself has no accounts any more — this app writes
 * with the service-role key in its own bundle, which is why it is the only thing that
 * can. The window opens on the upload form.
 *
 * Settings is forced open in one case only: a bundle built without those values, which
 * the build itself refuses to produce. About is the other exception to the screen order —
 * it answers "what am I running", a fair question of a copy that cannot reach its board
 * at all.
 *
 * **The board is a mode, and the switch is in the header.** There are two of them — the
 * gallery and the generated images — and which one you are on decides where an upload
 * lands, what Browse lists, what the post editor edits and which count the Tags grid
 * draws. One switch rather than a choice on each of those screens: it is the same answer
 * to all four, and a per-screen picker is four places for them to disagree about what you
 * are working on. It lives in `board-store.ts` rather than in this component's state for
 * the reason Browse keeps its query there — the screens unmount whenever something is in
 * front of them.
 *
 * **Collections is the one screen the switch does nothing to.** A collection is not a board
 * (`@common/collections`): its images carry no tags, are never searched and are in neither
 * gallery, so there is no mode to be in there and none of its channels takes one. The
 * switch stays drawn rather than being hidden on that screen — it is a mode the rest of the
 * window is still in, and a control that vanishes and comes back as you move between
 * screens is worse than one that is briefly beside the point.
 */
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const board = useBoard()
  const [view, setView] = useState<
    'upload' | 'browse' | 'collections' | 'tags' | 'settings' | 'about'
  >('upload')
  // A post the queue asked to review after uploading it. Held here because it is the one
  // thing one screen sends another, and cleared by any ordinary navigation — otherwise
  // Browse would reopen that editor the next time it is opened for its own reasons.
  const [reviewing, setReviewing] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setStatus(await window.api.getStatus())
  }, [])

  // The first read is a subscription to something outside React — the main process —
  // not a state sync, so the answer sets state from the callback rather than the effect
  // body, and a window closed mid-answer is left alone.
  useEffect(() => {
    let alive = true
    // The stored browse grid comes up behind the same "Starting…" as the status. It has
    // to be read before anything renders: `Browse` seeds itself from that copy on the way
    // up, synchronously, and a grid that arrives a tick later is a grid that arrives after
    // the search it was meant to save has already been sent.
    void Promise.all([window.api.getStatus(), hydrateBrowseCache()]).then(([next]) => {
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

  // Anything that takes the window off the upload form. Settings is forced open only when
  // the build carries no project — it is the screen that says so.
  const over =
    view === 'about' ? (
      <About status={status} />
    ) : !status.configured || view === 'settings' ? (
      // `onChanged` refreshes the status the compression rows are seeded from; nothing
      // on this screen can change which board the app talks to.
      <Settings status={status} onChanged={() => void refresh()} />
    ) : view === 'browse' ? (
      // Keyed on the board: switching mode is a fresh mount that seeds from that board's
      // remembered query and grid, rather than an update that would leave the other
      // board's rows on screen until the read landed.
      <Browse key={board} board={board} siteUrl={status.siteUrl} initialEdit={reviewing} />
    ) : view === 'collections' ? (
      // No `key={board}`: this screen is the same screen whichever board the header is
      // showing, which is the whole of what a collection is not.
      <Collections siteUrl={status.siteUrl} />
    ) : view === 'tags' ? (
      // Its posts, on a tag's panel, hands the query to Browse and switches to it —
      // `browseFor` seeds the module-level box that view mounts from, so this is one
      // call rather than another id threaded through `App` the way `reviewing` is.
      <TagIndex
        board={board}
        onBrowse={(query) => {
          browseFor(query)
          setReviewing(null)
          setView('browse')
        }}
      />
    ) : null

  /**
   * The only thing a nav item does. Pressing the one you were already on used to throw
   * you back to the upload form, which made the header's own answer to "where am I" also
   * a way of leaving — and a second press aimed at a screen that was slow to paint landed
   * you somewhere you had not asked for. Upload is reached by pressing Upload, like every
   * other screen.
   */
  const go = (target: typeof view) => () => {
    setReviewing(null)
    setView(target)
  }

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
        <div className="flex min-w-0 items-center gap-3">
          {status.siteUrl ? (
            <button
              type="button"
              onClick={() =>
                void window.api.openExternal(`${status.siteUrl}${searchHref('', board)}`)
              }
              title="Open this board in your browser"
              className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-muted transition-colors hover:text-foreground"
            >
              <span aria-hidden>🖼️</span>
              Open site
            </button>
          ) : (
            <span />
          )}

          {/*
            Which board everything on this window is about. A pair of segments rather than
            a dropdown or a checkbox: there are two of them, both are worth reading at a
            glance, and the thing you most need to know here is which one is *on* — a
            closed menu showing one name is a control you have to open to be sure about.
            It sits beside Open site rather than among the screens on the right, because it
            is not a screen: every item over there stays where it is when this is pressed.
          */}
          <div
            role="group"
            aria-label="Board"
            className={SEGMENTS}
          >
            {BOARDS.map((on) => (
              <button
                key={on}
                type="button"
                onClick={() => setBoard(on)}
                aria-pressed={on === board}
                title={`Work on ${boardLabel(on)}`}
                className={segment(on === board)}
              >
                <span aria-hidden>{BOARD_EMOJI[on]}</span>
                {boardLabel(on)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* The upload form, and the way back to it from every other screen — the one
              item here that is the app's actual job, so it leads the row. */}
          <button
            type="button"
            onClick={go('upload')}
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
            onClick={go('browse')}
            title="Find a post and edit or delete it"
            className={navClass(view === 'browse')}
          >
            <span aria-hidden>🔍</span>
            Browse
          </button>
          {/* The third gallery, and the one that is not a board. It sits after Browse
              because it is the same job — putting images somewhere and fixing the ones
              already there — over a different shelf, and before Tags because nothing in
              here has a tag on it. */}
          <button
            type="button"
            onClick={go('collections')}
            title="Sets of images kept off the board"
            className={navClass(view === 'collections')}
          >
            <span aria-hidden>🗂️</span>
            Collections
          </button>
          {/* Tag rules used to be the item beside this one. They are inside it now: a
              rule is written about a tag, and this is the screen with every tag on it —
              click a row and its rules are on the same panel as its name, with the whole
              map of them behind one button in that screen's corner. One less nav item
              for what was always one habit. */}
          <button type="button" onClick={go('tags')} className={navClass(view === 'tags')}>
            <span aria-hidden>🏷️</span>
            Tags
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
      <main className="min-h-0 flex-1 overflow-y-auto">
        {over}

        {/*
          The upload form is hidden rather than unmounted. Staging an image, half tagging
          it and then glancing at About used to throw all of that away — and an upload
          already in flight lost the component waiting for its answer.
        */}
        {status.configured && (
          <div
            className={
              over ? 'hidden' : 'mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pt-4 pb-25'
            }
          >
            {/* The empty drop zone is the whole screen's content, so it sits in the
                middle of it rather than hugging the header — but the row above it does
                not, which is why the centring is `my-auto` on the drop zone inside
                `UploadForm` and not a wrapper around the whole of it. `my-auto` rather
                than `justify-center` for the same reason it always was: once the staged
                image and its fields are taller than the window the auto margins collapse
                to zero, where centring would push the top of the form off the top of a
                scroller, out of reach. */}
            <UploadForm
              status={status}
              onReview={(postId) => {
                setReviewing(postId)
                setView('browse')
              }}
            />
          </div>
        )}
      </main>
    </div>
  )
}
