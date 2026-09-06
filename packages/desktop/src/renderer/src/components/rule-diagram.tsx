import { useEffect } from 'react'
import { asRating, RATING_COLOR, RATING_LABEL } from '@common/search'
import { categoryColor, type Tag } from '@common/tags'
import { BUTTON } from './buttons'
import { useImplications } from '../implications'
import { useRecommendations } from '../recommendations'
import type { ImplicationRules } from '../../../shared/implications'

/**
 * Every rule at once, drawn as what it actually is: a forest.
 *
 * The rules moved onto each tag's own panel, which is the right place to *write* one and
 * the wrong place to see what they add up to. An implication chains —
 * `school_swimsuit → one-piece_swimsuit → swimsuit` — and a list of rules one row each
 * hides exactly that, because the row that continues the chain is somewhere else in the
 * same alphabetical list. Laid out as trees the chain is the shape on the screen, and a
 * rule that quietly reaches four tags deep is visible without being traced by hand.
 *
 * Read-only on purpose. This is the answer to "what do my rules do", and a screen that
 * both explains and edits invites an edit made on a picture rather than on a tag.
 *
 * The board's tags come in from the screen behind, which already has them, so every name
 * here can be drawn in its category's colour and with its own emoji — the same way it is
 * drawn in the grid, the picker and on a post. A tree of identically grey names is a tree
 * you have to read word by word; coloured, the shape of a rule that reaches from a
 * character into a dozen general tags is visible before any of it is read. It is also the
 * only thing that can show a rule naming a tag the board does not have: nothing colours
 * it, so it is called out rather than left looking like the rest.
 */
export function RuleDiagram({ onClose, tags }: { onClose: () => void; tags: Tag[] | null }) {
  const implications = useImplications()
  const recommendations = useRecommendations()
  // null, not an empty map, while the screen behind has not read the board yet: an empty
  // index would call every name in the file unknown, which is the one claim this view
  // must not make on no evidence.
  const index = tags && new Map(tags.map((tag) => [tag.name, tag]))

  // Escape closes it, because it is an overlay over a screen you were in the middle of
  // and the mouse is not necessarily anywhere near the corner.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const roots = implicationRoots(implications)
  const offering = Object.keys(recommendations).sort()

  return (
    // Opaque rather than a scrim: this is a lot of small mono text, and the Tags grid
    // showing through it would be four columns of more of the same.
    <div className="fixed inset-0 z-30 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-4 pb-25">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            <span aria-hidden>🗺️</span> Rule map
          </h1>
          <span className="text-xs text-muted">
            {Object.keys(implications).length} implication
            {Object.keys(implications).length === 1 ? '' : 's'} · {offering.length} recommendation
            {offering.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`${BUTTON} ml-auto`}
          >
            <span aria-hidden>❌</span> Close
          </button>
        </div>

        <p className="max-w-2xl text-sm text-muted">
          Everything the rules on this machine would add to a post. A tag is written where
          it is typed; each step in is what that step drags in with it. Edit any of it by
          clicking the tag on the Tags screen — nothing here is uploaded, and the board has
          no rules of its own.
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            <span aria-hidden>🔗</span> Implications — added for you, and they chain
          </h2>
          {roots.length === 0 ? (
            <Empty>No implications yet. Click a tag on the Tags screen to write one.</Empty>
          ) : (
            // Columns rather than one long page: an implication tree is usually two or
            // three tags, and a full-width row per rule is mostly empty space to scroll
            // past. `break-inside-avoid` keeps a tree from being split down the middle.
            <div className="gap-x-8 sm:columns-2 lg:columns-3">
              {roots.map((root) => (
                <div key={root} className="mb-3 break-inside-avoid">
                  <Branch name={root} rules={implications} path={[root]} index={index} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            <span aria-hidden>💡</span> Recommendations — offered as chips, one level only
          </h2>
          {offering.length === 0 ? (
            <Empty>No recommendations yet.</Empty>
          ) : (
            // Flat, because they are flat: a recommendation never brings another one, so
            // a tree here would draw a depth the code does not have.
            <ul className="overflow-hidden rounded-lg border border-border">
              {offering.map((trigger) => (
                <li
                  key={trigger}
                  className="-mb-px flex items-start gap-2 border-b border-border px-3 py-2"
                >
                  <span className="w-44 shrink-0 truncate">
                    <TagName name={trigger} index={index} />
                  </span>
                  <span aria-hidden className="shrink-0 text-xs text-muted">
                    ⇢
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {recommendations[trigger].map((name) => (
                      <span
                        key={name}
                        className="rounded border border-dashed border-border px-2"
                      >
                        <TagName name={name} index={index} />
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * One tag name, in its category's colour and behind its own emoji — as the grid, the
 * picker and a post's chips draw it.
 *
 * The stored spelling, underscores and all, rather than `tagLabel`: this is a view of a
 * file, and the names in it are what the rules match on. A name the board has no tag for
 * is drawn plain and says so — since a rule is picked from the grid now, one of those is
 * a leftover from when they were typed, and it can never fire.
 */
function TagName({ name, index }: { name: string; index: Map<string, Tag> | null }) {
  const tag = index?.get(name)

  // Plain and unremarked while the index has not landed — the name is drawn, nothing is
  // claimed about it.
  if (!tag && !index) return <span className="font-mono text-xs">{name}</span>

  if (!tag) {
    return (
      <span
        className="font-mono text-xs italic text-muted"
        title="No tag on the board has this name — this rule can never fire"
      >
        {name}
      </span>
    )
  }

  return (
    <span className={`font-mono text-xs ${categoryColor(tag.category)}`}>
      {tag.emoji && <span aria-hidden>{tag.emoji} </span>}
      {name}
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
      {children}
    </p>
  )
}

/**
 * One tag and everything below it, drawn as an indented tree.
 *
 * The connectors are borders, not an SVG: a left rule down the child list and a short
 * horizontal stub into each child is the whole drawing, it reflows with the text at any
 * width, and it needs no measuring pass. `top-2.5` is the middle of a `text-xs` label
 * row, which is what the stub has to point at.
 *
 * `path` is the chain that reached here, so a cycle is drawn once and marked rather than
 * recursed into forever — two tags implying each other is useless, not fatal.
 */
function Branch({
  name,
  rules,
  path,
  index,
}: {
  name: string
  rules: ImplicationRules
  path: string[]
  index: Map<string, Tag> | null
}) {
  const entries = rules[name] ?? []
  const children = entries.filter((entry) => !asRating(entry))
  const rating = entries.reduce<ReturnType<typeof asRating>>(
    (found, entry) => asRating(entry) ?? found,
    null
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <TagName name={name} index={index} />
        {/* The rating floor sits on the tag that raises it rather than among its implied
            tags: it is a consequence of a different kind, and it never continues a chain. */}
        {rating && (
          <span
            className={`rounded border border-border px-1.5 font-mono text-[10px] ${RATING_COLOR[rating]}`}
            title={`Raises the rating to at least ${RATING_LABEL[rating]}`}
          >
            ≥ {RATING_LABEL[rating]}
          </span>
        )}
      </div>

      {children.length > 0 && (
        <ul className="ml-1 flex flex-col border-l border-border pl-3">
          {children.map((child) => {
            const looped = path.includes(child)
            return (
              <li
                key={child}
                className="relative py-0.5 before:absolute before:-left-3 before:top-2.5 before:h-px before:w-3 before:bg-border"
              >
                {looped ? (
                  <span className="opacity-50" title="Already in this chain">
                    <TagName name={child} index={index} /> <span aria-hidden>↺</span>
                  </span>
                ) : (
                  <Branch name={child} rules={rules} path={[...path, child]} index={index} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/**
 * Where to start drawing: the tags nothing else implies, which is what makes a tree a
 * tree rather than a subtree drawn twice.
 *
 * Anything left over after that walk is a rule caught in a cycle, or one only reachable
 * through one — it gets a root of its own rather than being dropped, since a rule that
 * does not appear at all on the map is worse than one drawn in an odd place.
 */
function implicationRoots(rules: ImplicationRules): string[] {
  const implied = new Set<string>()
  for (const entries of Object.values(rules)) {
    for (const entry of entries) {
      if (!asRating(entry)) implied.add(entry)
    }
  }

  const triggers = Object.keys(rules).sort()
  const roots = triggers.filter((tag) => !implied.has(tag))

  // Mark everything those roots reach, so an orphaned cycle can be told from a tag that
  // is simply drawn deeper down some other tree.
  const reached = new Set(roots)
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.shift() as string
    for (const entry of rules[name] ?? []) {
      if (asRating(entry) || reached.has(entry)) continue
      reached.add(entry)
      queue.push(entry)
    }
  }

  return [...roots, ...triggers.filter((tag) => !reached.has(tag))]
}
