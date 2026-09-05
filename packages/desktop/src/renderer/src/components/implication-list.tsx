import { useState } from 'react'
import { categoryColor } from '@common/tags'
import {
  asRating,
  RATING_COLOR,
  RATING_LABEL,
  RATINGS,
  ratingToken,
  searchHref,
  tagLabel,
  type Rating,
} from '@common/search'
import { EMPTY_TAGS, TagField, namesOf, type TagFieldValue } from './tag-field'
import { saveImplications, useImplications } from '../implications'
import type { ImplicationRules } from '../../../shared/implications'

/**
 * The implication rules, and the only way to write one without opening `save.json`.
 *
 * A rule is "when I add this tag, add those too", and it exists because the specific tag
 * is the one you remember — `white_bra` gets typed and `bra` gets forgotten, so the post
 * never comes back for the search anyone would actually run. The rules are this
 * machine's, not the board's: nothing about them is uploaded, and a post made from this
 * queue is indistinguishable from one where every name was typed by hand.
 *
 * Both boxes are tag fields, so both autocomplete against the board — which matters more
 * here than anywhere else in the app, since a rule is written once and then fires
 * silently forever, and one made against a misspelling would quietly spread it. They are
 * the two fields in the app with the rules switched *off*: a name typed here is the name
 * itself, not a post carrying it, so a box that expanded `white_bra` into `bra` would be
 * applying the rules to the rule being written.
 *
 * The left box taking several tags is deliberate: `white_bra black_bra red_bra → bra` is
 * the shape these come in, and writing it out three times is how a rule set stops getting
 * written. Each name on the left becomes its own rule.
 */
export function ImplicationList({ siteUrl }: { siteUrl: string }) {
  const rules = useImplications()
  const [when, setWhen] = useState<TagFieldValue>(EMPTY_TAGS)
  const [add, setAdd] = useState<TagFieldValue>(EMPTY_TAGS)
  // '' is "leave the rating alone", which is what most rules want and so the default
  const [addRating, setAddRating] = useState<Rating | ''>('')
  const [error, setError] = useState('')

  const triggers = Object.keys(rules).sort()

  /** Merges rather than replaces, so adding `white_bra → underwear` keeps its `→ bra`. */
  function addRule() {
    const from = namesOf(when)
    // The rating rides in the same list as the tags — `shared/implications.ts` has why —
    // so a rule that only raises the rating is a rule like any other.
    const implied = [...namesOf(add), ...(addRating ? [ratingToken(addRating)] : [])]
    if (from.length === 0) {
      setError('Name at least one tag to imply from.')
      return
    }
    if (implied.length === 0) {
      setError('A rule needs a tag to add or a rating to raise.')
      return
    }

    const next: ImplicationRules = { ...rules }
    for (const trigger of from) {
      // A tag implying itself is dropped rather than refused: in `white_bra → bra
      // white_bra` the second name is a slip, and the rest of the rule is still meant.
      const merged = [...(next[trigger] ?? [])]
      for (const name of implied) {
        if (name !== trigger && !merged.includes(name)) merged.push(name)
      }
      if (merged.length > 0) next[trigger] = merged
    }

    setWhen(EMPTY_TAGS)
    setAdd(EMPTY_TAGS)
    setAddRating('')
    setError('')
    void saveImplications(next)
  }

  /** Drops one implied tag, and the rule with it once nothing is left on the right. */
  function removeImplied(trigger: string, implied: string) {
    const kept = (rules[trigger] ?? []).filter((name) => name !== implied)
    const next: ImplicationRules = { ...rules }
    if (kept.length > 0) next[trigger] = kept
    else delete next[trigger]
    void saveImplications(next)
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold tracking-tight">Implications</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          When a tag on the left is added to an image, the tags on the right are added with
          it, and the rating is raised to at least what the rule asks for — never lowered.
          Rules chain, so one rule can reach what another rule adds.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
        <TagField
          value={when}
          onChange={(next) => {
            setWhen(next)
            setError('')
          }}
          label="When I add"
          hint={false}
          placeholder="white_bra black_bra"
        />
        <TagField
          value={add}
          onChange={(next) => {
            setAdd(next)
            setError('')
          }}
          label="Also add"
          hint={false}
          placeholder="bra underwear"
        />
        {/* A floor, not a setting: it lifts an image that is rated lower and leaves a
            higher one alone, which is `raisedRating` and is said here rather than left
            to be discovered. */}
        <label className="flex flex-col gap-1.5 text-sm">
          Raise rating to at least
          <select
            value={addRating}
            onChange={(event) => setAddRating(event.target.value as Rating | '')}
            className="min-h-11 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-accent sm:w-56"
          >
            <option value="">Leave the rating alone</option>
            {RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {RATING_LABEL[rating]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addRule}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium hover:border-accent"
          >
            Add rule
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {triggers.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No rules yet — the boxes above write the first one.
        </p>
      ) : (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Rules ({triggers.length})
          </h3>
          {/* Ruled like the Tags screen, and for the same reason: a row of chips sitting in
              open space reads as belonging to the line above it as much as to its own. */}
          <ul className="overflow-hidden rounded-lg border border-border">
            {triggers.map((trigger) => (
              <li
                key={trigger}
                className="-mb-px flex items-center gap-2 border-b border-border px-3 py-2"
              >
                {/* The trigger opens the board's own search for it — the question a rule
                    raises is "what does this tag already have on it", and this window has
                    no gallery to answer it in. */}
                <button
                  type="button"
                  disabled={!siteUrl}
                  onClick={() =>
                    // `searchHref` rather than a literal path: it is the only thing
                    // allowed to spell where the listing lives.
                    void window.api.openExternal(`${siteUrl}${searchHref(trigger)}`)
                  }
                  title={siteUrl ? `Open ${tagLabel(trigger)} on the board` : trigger}
                  className={`w-44 shrink-0 truncate text-left font-mono text-xs hover:underline disabled:no-underline ${categoryColor('general')}`}
                >
                  {trigger}
                </button>
                <span aria-hidden className="shrink-0 text-muted">
                  →
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {/* The ✕ on each chip is the only remove there is. A bin at the end of
                      the row was a second one: a rule is nothing but its implied tags, so
                      taking the last one off already deletes it, and on a one-tag rule the
                      two controls sat side by side doing the same thing. */}
                  {rules[trigger].map((implied) => {
                    // Shown as it is stored — it is what the file says, and
                    // `rating:explicit` is the board's own query spelling — but coloured
                    // on the rating scale so it doesn't read as a tag with a colon in it.
                    const rating = asRating(implied)
                    return (
                      <span
                        key={implied}
                        // A pill, not bare text: the tag field's chips get away with
                        // `bg-background` because they sit on the field's own surface,
                        // and these sit straight on the page, where that is the same
                        // colour as nothing at all.
                        className={`flex items-center rounded border border-border bg-surface pl-2 font-mono text-xs ${
                          rating ? RATING_COLOR[rating] : ''
                        }`}
                      >
                        {implied}
                        <button
                          type="button"
                          onClick={() => removeImplied(trigger, implied)}
                          aria-label={
                            rating
                              ? `Stop ${trigger} raising the rating`
                              : `Stop ${trigger} adding ${implied}`
                          }
                          className="flex min-h-7 items-center px-1.5 text-muted hover:text-red-400"
                        >
                          ✕
                        </button>
                      </span>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
