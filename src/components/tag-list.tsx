import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { categoryColor, categoryLabel, categoryOrder, markColor, type Tag } from '@common/tags'
import type { Board } from '@common/board'
import { parseSearchQuery, searchHref, tagLabel, withTag, withoutTag } from '@common/search'

/**
 * ➕/➖ share the count's slot on the right: the count fades out and the buttons take its
 * place while the row is hovered or keyboard-focused, so a resting list is just names and
 * numbers. Coarse pointers have no hover, so there the buttons sit beside the count.
 *
 * `plus` is optional because on an empty search it has nothing of its own to do: adding a
 * tag to no query and replacing no query with that tag are the same search, and the tag's
 * own name already does it. Offering both put two controls on a row for one outcome, and
 * the smaller of the two was the one that looked like the real button.
 */
export function FacetActions({
  count,
  plus,
  minus,
}: {
  /** Optional: a facet with no counter behind it renders the buttons without one. */
  count?: number
  plus?: { href: string; label: string; on: boolean }
  minus: { href: string; label: string; on: boolean }
}) {
  // Emoji ignore `color`, so an off button is desaturated and brightened instead — against
  // a near-black background that lands it around `--muted`, where fading it with opacity
  // would only sink it into the background. Hover restores the glyph's own colour.
  const button = (on: boolean) =>
    `pointer-fine:min-h-7 flex min-h-9 w-6 items-center justify-center text-xs transition-[filter] ${
      on ? '' : 'brightness-150 grayscale hover:brightness-100 hover:grayscale-0'
    }`

  // With no count to sit behind, the buttons have nothing to reveal themselves from
  // under, so they are simply always on screen rather than waiting for a hover that
  // would leave the row looking empty until it came.
  const bare = count === undefined

  return (
    <span className="pointer-fine:min-h-7 relative flex min-h-9 items-center justify-end">
      {!bare && (
        <span className="pointer-coarse:opacity-100 text-xs tabular-nums text-muted transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
          {count}
        </span>
      )}
      <span
        className={
          bare
            ? 'ml-1 flex items-center'
            : 'pointer-coarse:relative pointer-coarse:ml-1 pointer-coarse:opacity-100 absolute right-0 flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'
        }
      >
        {plus && (
          <Link href={plus.href} aria-label={plus.label} className={button(plus.on)}>
            ➕
            <NavProgress />
          </Link>
        )}
        <Link href={minus.href} aria-label={minus.label} className={button(minus.on)}>
          ➖
          <NavProgress />
        </Link>
      </span>
    </span>
  )
}

/**
 * What a tag carries in front of its name — `tags.mark`, set per tag in the desktop app
 * and null for most of them, which is why this renders nothing rather than a space.
 *
 * One column, two kinds of thing: a colour is drawn as a dot, anything else as text.
 * `markColor` is the whole of that decision and it is shared with the desktop app, so a
 * tag looks the same in both windows. The dot's border keeps white and black from
 * disappearing into the two grounds they would otherwise match.
 *
 * `aria-hidden`, like every emoji on the site: it is decoration in front of a name the
 * screen reader is about to read anyway, and "woman's briefs" announced ahead of
 * `panties` is worse than silence.
 *
 * Inline with a margin rather than a flex child, so it goes in front of the label text
 * itself wherever a tag is drawn — including inside a truncating cell, where sitting at
 * the head of the string is what keeps it out of the ellipsis.
 */
export function TagMark({ mark }: { mark: string | null }) {
  if (!mark) return null

  const color = markColor(mark)
  if (!color) {
    return (
      <span aria-hidden className="mr-1">
        {mark}
      </span>
    )
  }

  return (
    <span
      aria-hidden
      style={{ background: color }}
      className="mr-1 inline-block size-3 shrink-0 translate-y-px rounded-full border border-border"
    />
  )
}

export type TagEntry = { tag: Tag; count: number }

/**
 * A tag row: tapping the name replaces the whole query with just this tag — one filter,
 * nothing carried over — while the hover-revealed ➕/➖ add it to the current search or
 * exclude it. Both toggle: pressing the one already on removes the tag again.
 *
 * ➕ appears only once something is being searched for, since with an empty query it is
 * the tag's own name spelled a second way. ➖ stays either way: `-tag` on nothing is
 * everything *except* this, which no other control on the row says.
 *
 * `min-h-9` buys a thumb-sized target, but a mouse doesn't need one and the slack reads as
 * a gappy list, so fine pointers get rows just tall enough for the text.
 */
function TagRow({
  entry,
  currentQuery,
  board,
}: {
  entry: TagEntry
  currentQuery: string
  board: Board
}) {
  const { tag, count } = entry
  const { include, exclude } = parseSearchQuery(currentQuery)
  const included = include.includes(tag.name)
  const excluded = exclude.includes(tag.name)
  const label = tagLabel(tag.name)

  return (
    <li className="group flex items-center gap-1">
      <Link
        href={searchHref(tag.name, board)}
        aria-label={`Search only ${label}`}
        className={`pointer-fine:min-h-7 min-h-9 flex-1 py-1 text-sm hover:underline ${categoryColor(tag.category)} ${
          included ? 'font-semibold underline' : ''
        } ${excluded ? 'line-through opacity-60' : ''}`}
      >
        <TagMark mark={tag.mark} />
        {label}
        <NavProgress />
      </Link>
      <FacetActions
        count={count}
        plus={
          currentQuery.trim()
            ? {
                href: searchHref(
                  included ? withoutTag(currentQuery, tag.name) : withTag(currentQuery, tag.name),
                  board
                ),
                label: included ? `Remove ${label} from the search` : `Add ${label} to the search`,
                on: included,
              }
            : undefined
        }
        minus={{
          href: searchHref(
            excluded
              ? withoutTag(currentQuery, tag.name)
              : withTag(currentQuery, tag.name, 'exclude'),
            board
          ),
          label: excluded ? `Stop excluding ${label}` : `Exclude ${label}`,
          on: excluded,
        }}
      />
    </li>
  )
}

/**
 * The same tag as a chip, for the arrangements where the tags run across the page rather
 * than down a column beside it. A column has height to spend and a page has none: one tag
 * per line is the right shape when the list is 288px wide and the wrong one when it is the
 * whole window, where twenty tags became twenty lines and pushed the picture off the
 * screen. Wrapped chips put the same twenty on two.
 *
 * **The chip is one link and nothing else.** The row's ➕/➖ are for building a query out
 * of what is on screen, which is the listing's job — here the reader is looking at one
 * post, and the question a tag answers is "show me these", which the name already does.
 * Two more targets inside a 90px chip bought a second meaning for a press that has an
 * obvious first one. With them gone the whole chip is the link, plainly, rather than a
 * stretched pseudo-element reaching around two things that had to sit above it.
 *
 * No underline either: a border, a ground and a category colour are already saying this
 * is pressable, and underlining the word inside the button on hover says it twice.
 */
function TagPill({
  entry,
  currentQuery,
  board,
}: {
  entry: TagEntry
  currentQuery: string
  board: Board
}) {
  const { tag, count } = entry
  const { include, exclude } = parseSearchQuery(currentQuery)
  const included = include.includes(tag.name)
  const excluded = exclude.includes(tag.name)
  const label = tagLabel(tag.name)

  return (
    <li>
      <Link
        href={searchHref(tag.name, board)}
        aria-label={`Search only ${label}`}
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-0.5 pl-2.5 pr-3 hover:border-muted"
      >
        <span
          className={`whitespace-nowrap text-sm ${categoryColor(tag.category)} ${
            included ? 'font-semibold' : ''
          } ${excluded ? 'line-through opacity-60' : ''}`}
        >
          <TagMark mark={tag.mark} />
          {label}
        </span>
        <span className="text-xs tabular-nums text-muted">{count}</span>
        <NavProgress />
      </Link>
    </li>
  )
}

/** Who made it, what it is from, who is in it — see `headings` below. */
const NAMED_CATEGORIES: readonly string[] = ['artist', 'copyright', 'character']

/**
 * Sectioned by category in Danbooru order, A–Z within each one. The caller's order still
 * matters — it decides which tags survive a facet list's cap — but once a set is on
 * screen a name is looked up by reading down the column, so alphabetical is the order to
 * read it in. Used by the sidebar/drawer facets and the post detail page.
 *
 * `headings` is what those two callers disagree about. A facet list is a set of filters
 * and every heading in it says which kind of filter the rows under it are. One post's
 * tags are a description, and there the headings outnumbered what they organised — a
 * post with two Appearance tags and one Activity tag was three rows under two headings,
 * most of the column being labels for lists of one. So `'named'` keeps the three that
 * answer a question the tag itself cannot (who drew it, what it is from, who is in it)
 * and runs the rest together as one list, where the colour already says what each is.
 */
export function GroupedTagList({
  entries,
  currentQuery = '',
  empty = 'No tags here.',
  headings = 'every',
  flow = 'list',
  board = 'post',
}: {
  entries: TagEntry[]
  currentQuery?: string
  /** Which listing a tag link lands in. A tag means the same thing on both boards, so
      the name is the same either way — what changes is which one you end up looking at,
      and a facet that sent you off the board you were reading would be the drawer
      undoing the page it belongs to. */
  board?: Board
  empty?: string
  headings?: 'every' | 'named'
  /** `pills` wraps the tags across the width instead of down it — see `TagPill`. */
  flow?: 'list' | 'pills'
}) {
  const groups = categoryOrder(entries.map((e) => e.tag.category))
    .map(
      (category) =>
        [
          category,
          entries
            // Sorted by the label rather than the raw name, so the underscores the reader
            // never sees can't push a row out of the order the column appears to be in
            .filter((e) => e.tag.category === category)
            .sort((a, b) => tagLabel(a.tag.name).localeCompare(tagLabel(b.tag.name))),
        ] as const
    )
    .filter(([, group]) => group.length > 0)

  if (groups.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>
  }

  const labelled =
    headings === 'named' ? groups.filter(([c]) => NAMED_CATEGORIES.includes(c)) : groups
  // The categories that lost their heading stay in category order and become one list,
  // since a run of headingless sections would be gaps with nothing to separate
  const rest = headings === 'named' ? groups.filter(([c]) => !NAMED_CATEGORIES.includes(c)) : []

  const pills = flow === 'pills'
  const list = pills ? 'flex flex-wrap gap-1.5' : 'flex flex-col gap-0.5'
  const draw = (entry: TagEntry) =>
    pills ? (
      <TagPill key={entry.tag.id} entry={entry} currentQuery={currentQuery} board={board} />
    ) : (
      <TagRow key={entry.tag.id} entry={entry} currentQuery={currentQuery} board={board} />
    )

  return (
    <div className={pills ? 'flex flex-col gap-2.5' : 'pointer-fine:gap-3 flex flex-col gap-4'}>
      {labelled.map(([category, group]) => (
        <section key={category}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {categoryLabel(category)}
          </h3>
          <ul className={list}>{group.map(draw)}</ul>
        </section>
      ))}
      {rest.length > 0 && <ul className={list}>{rest.flatMap(([, group]) => group.map(draw))}</ul>}
    </div>
  )
}

// Re-exported so the components that paint tags keep one import for the whole set
export { categoryColor, categoryLabel }
