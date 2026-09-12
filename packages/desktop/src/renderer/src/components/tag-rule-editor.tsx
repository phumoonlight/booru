import { useState } from 'react'
import {
  asRating,
  RATING_COLOR,
  RATING_LABEL,
  RATINGS,
  ratingToken,
  tagLabel,
  type Rating,
} from '@common/search'
import type { RuleKind } from '@common/data/rules'
import { saveImplication, useImplications, useImplicationsSaving } from '../implications'
import {
  saveRecommendation,
  useRecommendations,
  useRecommendationsSaving,
} from '../recommendations'

import { RuleSearch } from './tag-rule-search'

/** Which of a tag's two rules is being written — the table's `kind` column, exactly. */
export type { RuleKind }

/**
 * One tag's rule with `name` added or taken out. An empty answer deletes the rule, which
 * is how the last ✕ and the last un-tick in the grid remove one.
 *
 * A rating token rides in the same list and is never toggled: it is a consequence of a
 * different kind, set by the menu rather than picked from the grid, so it passes through
 * untouched.
 *
 * Still exported: it is the one spelling of what adding and removing a name mean, and the
 * chips' ✕ and the search list below both go through it.
 */
export function toggleRuleName(current: string[], name: string): string[] {
  return current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
}

/**
 * Both kinds of tag rule for one tag, inside that tag's own panel on the Tags screen.
 *
 * The rules used to have a screen of their own, whose first box named the trigger. That
 * box was the whole problem: a rule is written *about* a tag, and the screen with every
 * tag on it — its category, its count, its exact spelling — was the other one. Writing
 * `white_bra → bra` meant typing a name that was already on screen somewhere else,
 * against an autocomplete rather than against the list. Here the trigger is the row that
 * was clicked, so there is nothing to type on the left and nothing to misspell.
 *
 * **The right side is still not typed — it is searched.** Each column has a box, and a
 * name is added by picking it out of what the box finds. A rule can only name tags the
 * board actually has, which was already the rule everywhere a post is tagged
 * (`CategoryTagField` offers existing tags only) and is true here too, on the one screen
 * where coining the missing one is a button away. What it costs is a rule written ahead of
 * the tag it names; that was never worth much, since such a rule sits silent until the tag
 * exists.
 *
 * It was **Choose from the list**, which turned the whole grid below into the picker:
 * click tags to tick them in, Done or Escape to stop. That read well on a board of thirty
 * tags and stopped working on one of several hundred — the answer is one name, the grid is
 * a page of folded categories, and finding it meant scrolling past everything the rule is
 * not about with a panel pinned over the top of it. A box is the same promise (only names
 * the board has) asked the other way round: say what you are looking for rather than go
 * and find it. The grid has no picking mode at all now: the tag catalogs were the other
 * thing filled in that way, and they are gone. That gesture was good at gathering a *set* by
 * reading down a list, and bad at the job a rule is — finding one name.
 *
 * The rules themselves live on the board now, on `tag_rules`, so a rule survives a
 * rename of either tag it names and goes when one of them does. What this panel sends is
 * one tag's whole list — the tag whose panel is open, which is the only one it can have
 * an opinion about.
 */
export function TagRuleEditor({ tag }: { tag: string }) {
  const implications = useImplications()
  const recommendations = useRecommendations()
  // Per rule set, not one flag for the panel: the two columns are written by separate
  // controls, and a word under the wrong heading says the wrong thing happened.
  const savingImplies = useImplicationsSaving()
  const savingRecommends = useRecommendationsSaving()

  const impliedNow = implications[tag] ?? []
  // The rating rides in the same list as the tags (`shared/implications.ts` has why), so
  // the two are split back apart here rather than stored apart.
  const impliedTags = impliedNow.filter((name) => !asRating(name))
  const floor = impliedNow.reduce<Rating | ''>((found, name) => asRating(name) ?? found, '')
  const offeredNow = recommendations[tag] ?? []

  return (
    // Two columns where there is room, because they are two answers to one question and
    // reading them side by side is what says they are alternatives rather than steps.
    <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            <span aria-hidden>🔗</span> Implies
          </h3>
          {/* The heading used to carry "— added for you", and the other "— offered as
              chips". Two suffixes doing the work of a sentence each, in a size and a
              casing meant for a word: the difference between the lists is the one thing
              worth explaining here, and it belongs behind the glyph that means exactly
              that, on both columns, said properly. */}
          <Tip label="What an implication is">
            Put this tag on a post and these go on too, by themselves. They can bring their own tags
            along as well. A rating here can only push a post <em>up</em> — it never lowers one.
          </Tip>
          {/* Every control in this column writes on use, so this word is the whole
              feedback it gives — the same line the post editor draws, for the same reason.
              A rule is a round trip to the board now rather than a line in a local file,
              and a panel that looks identical while one is in flight is a panel you press
              twice. */}
          <Saving on={savingImplies} />
        </div>

        <RuleChips
          names={impliedTags}
          empty="Nothing yet."
          onRemove={(name) => void saveImplication(tag, toggleRuleName(impliedNow, name))}
          label={(name) => `Stop ${tag} adding ${name}`}
        />

        <RuleSearch
          tag={tag}
          chosen={impliedTags}
          onAdd={(name) => void saveImplication(tag, toggleRuleName(impliedNow, name))}
          label={`Search a tag for ${tagLabel(tag)} to imply`}
        />

        {/* A floor, not a setting: it lifts an image rated lower and leaves a higher one
            alone, which is `raisedRating` and is said here rather than left to be
            discovered. The one thing on this panel still chosen from a menu, because a
            rating is not among the tags in the grid and never could be. It writes on
            change — there is no rule to compose, only a value to set.

            Disabled while that write is out, unlike the chips beside it. A chip is a
            list you add to, so pressing a second one mid-write is a second thing to do;
            this is one value, and its `value` is `floor` — which is still the old rating
            until the board answers. An open menu during a write would offer the previous
            state as the current one, and a second choice would be made against it. */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Raise rating to at least
          <select
            value={floor}
            disabled={savingImplies}
            onChange={(event) => {
              const next = event.target.value as Rating | ''
              void saveImplication(tag, [...impliedTags, ...(next ? [ratingToken(next)] : [])])
            }}
            className={`min-h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-accent disabled:opacity-50 ${
              floor ? RATING_COLOR[floor] : ''
            }`}
          >
            <option value="" className="bg-background text-foreground">
              Leave the rating alone
            </option>
            {RATINGS.map((rating) => (
              <option
                key={rating}
                value={rating}
                className={`bg-background ${RATING_COLOR[rating]}`}
              >
                {RATING_LABEL[rating]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            <span aria-hidden>💡</span> Recommends
          </h3>
          <Tip label="What a recommendation is">
            {/* No rating here, and there never was one: a rating is not a chip you press,
                and the implications opposite already cover the case where it should move
                on its own. */}
            Put this tag on a post and these are <em>offered</em> as buttons. Nothing is added until
            you press one — for tags that usually go together, not always.
          </Tip>
          <Saving on={savingRecommends} />
        </div>

        {/* Dashed, against the implications' solid: one of these lists goes on the post
            whether or not anyone looks, and the other waits to be pressed. */}
        <RuleChips
          names={offeredNow}
          dashed
          empty="Nothing yet."
          onRemove={(name) => void saveRecommendation(tag, toggleRuleName(offeredNow, name))}
          label={(name) => `Stop ${tag} offering ${name}`}
        />

        <RuleSearch
          tag={tag}
          chosen={offeredNow}
          onAdd={(name) => void saveRecommendation(tag, toggleRuleName(offeredNow, name))}
          label={`Search a tag for ${tagLabel(tag)} to recommend`}
        />
      </section>
    </div>
  )
}

/**
 * The one word this panel says back. Drawn always and faded rather than mounted on demand,
 * so the heading row does not reflow the moment a chip is pressed — it is a word
 * appearing, not a layout changing.
 *
 * The chips stay live while it shows — pressing a second one during the first write is a
 * second thing to do, and the store keeps the answer to the later of the two rather than
 * whichever round trip happens to land last. The rating menu is the exception and
 * disables itself; the comment beside it says why.
 */
function Saving({ on }: { on: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`text-xs text-muted transition-opacity ${on ? '' : 'opacity-0'}`}
    >
      saving…
    </span>
  )
}

/**
 * A note folded behind an ℹ️, next to the heading it is about.
 *
 * Drawn as the glyph alone, which is the one place in this app that is allowed: it sits
 * beside its own heading, so what it is about is already written next to it, and the
 * label a screen reader gets says the rest.
 *
 * It **floats** rather than unfolding in place. Opened in the flow it pushed the whole
 * column down — on a panel that is pinned over the tag grid, reading two lines of prose
 * moved everything under it, and closing the note moved it all back. A note is something
 * you glance at and dismiss; it should cost the layout nothing. Absolute against a
 * `relative` wrapper the width of the glyph, so it hangs under the ℹ️ wherever that
 * lands, and `z-20` to clear the chips and the picker button below it.
 *
 * Click to close, not blur: blur fires before the click, so a second press on the glyph
 * would close and immediately reopen it, and the note would look stuck.
 */
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        // No ground on hover and no fade at rest — the two things every other button
        // here does. It is one glyph next to a heading, so a hover panel behind it is a
        // box appearing around a single character, and dimming it at rest made the one
        // control that offers an explanation look like the disabled one. Brightness
        // instead: a filter is the only lever an emoji has, since it carries its own
        // colour and `text-*` does nothing to it.
        className="flex min-h-6 items-center rounded px-1 text-xs transition-[filter] hover:brightness-125"
      >
        <span aria-hidden>ℹ️</span>
      </button>
      {open && (
        // `normal-case` and the rest undo the heading beside it, whose uppercase and
        // letter-spacing this would otherwise inherit through the flex row.
        <p className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-muted shadow-lg">
          {children}
        </p>
      )}
    </div>
  )
}

/** One rule's consequences, each removable by its own ✕ — the last one deletes the rule. */
function RuleChips({
  names,
  empty,
  onRemove,
  label,
  dashed = false,
}: {
  names: string[]
  empty: string
  onRemove: (name: string) => void
  label: (name: string) => string
  dashed?: boolean
}) {
  if (names.length === 0) return <p className="text-xs text-muted">{empty}</p>

  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className={`flex items-center rounded border bg-background pl-2 font-mono text-xs ${
            dashed ? 'border-dashed border-border' : 'border-border'
          }`}
        >
          {name}
          <button
            type="button"
            onClick={() => onRemove(name)}
            aria-label={label(name)}
            className="flex min-h-7 items-center px-1.5 text-muted hover:text-[#ff5d5f]"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  )
}
