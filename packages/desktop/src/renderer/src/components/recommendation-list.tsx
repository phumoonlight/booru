import { useState } from 'react'
import { categoryColor } from '@common/tags'
import { searchHref, tagLabel } from '@common/search'
import { EMPTY_TAGS, TagField, namesOf, type TagFieldValue } from './tag-field'
import { saveRecommendations, useRecommendations } from '../recommendations'
import type { RecommendationRules } from '../../../shared/recommendations'

/**
 * The recommendation rules: "when this tag is on a post, remind me about those".
 *
 * The same editor as the implications above it, minus the rating — a rating is not a chip
 * you press, and the implications already cover the case where one should move on its
 * own. The difference between the two screens is entirely in what the queue does with the
 * answer: an implication is added, a recommendation is offered, and pressing nothing
 * leaves the post exactly as you typed it.
 *
 * Its boxes pass `applyRules={false}` for the same reason the implications' do: a name
 * typed here is the name itself, not a post carrying it.
 */
export function RecommendationList({ siteUrl }: { siteUrl: string }) {
  const rules = useRecommendations()
  const [when, setWhen] = useState<TagFieldValue>(EMPTY_TAGS)
  const [add, setAdd] = useState<TagFieldValue>(EMPTY_TAGS)
  const [error, setError] = useState('')

  const triggers = Object.keys(rules).sort()

  /** Merges rather than replaces, so a second thought about `panties` keeps the first. */
  function addRule() {
    const from = namesOf(when)
    const suggested = namesOf(add)
    if (from.length === 0 || suggested.length === 0) {
      setError('Both boxes need at least one tag.')
      return
    }

    const next: RecommendationRules = { ...rules }
    for (const trigger of from) {
      const merged = [...(next[trigger] ?? [])]
      for (const name of suggested) {
        if (name !== trigger && !merged.includes(name)) merged.push(name)
      }
      if (merged.length > 0) next[trigger] = merged
    }

    setWhen(EMPTY_TAGS)
    setAdd(EMPTY_TAGS)
    setError('')
    void saveRecommendations(next)
  }

  /** Drops one suggestion, and the rule with it once nothing is left on the right. */
  function removeSuggestion(trigger: string, suggestion: string) {
    const kept = (rules[trigger] ?? []).filter((name) => name !== suggestion)
    const next: RecommendationRules = { ...rules }
    if (kept.length > 0) next[trigger] = kept
    else delete next[trigger]
    void saveRecommendations(next)
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold tracking-tight">Recommendations</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          When a tag on the left is on an image, the tags on the right are offered under the
          tag box as chips to press. Nothing is added until you press one, so this is the
          list for tags that <em>often</em> go together rather than always.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
        <TagField
          value={when}
          onChange={(next) => {
            setWhen(next)
            setError('')
          }}
          label="When an image has"
          hint={false}
          placeholder="panties"
          applyRules={false}
        />
        <TagField
          value={add}
          onChange={(next) => {
            setAdd(next)
            setError('')
          }}
          label="Offer me"
          hint={false}
          placeholder="black_panties bow_panties"
          applyRules={false}
        />
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
          No recommendations yet — the boxes above write the first one.
        </p>
      ) : (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Rules ({triggers.length})
          </h3>
          <ul className="overflow-hidden rounded-lg border border-border">
            {triggers.map((trigger) => (
              <li
                key={trigger}
                className="-mb-px flex items-center gap-2 border-b border-border px-3 py-2"
              >
                <button
                  type="button"
                  disabled={!siteUrl}
                  onClick={() => void window.api.openExternal(`${siteUrl}${searchHref(trigger)}`)}
                  title={siteUrl ? `Open ${tagLabel(trigger)} on the board` : trigger}
                  className={`w-44 shrink-0 truncate text-left font-mono text-xs hover:underline disabled:no-underline ${categoryColor('general')}`}
                >
                  {trigger}
                </button>
                <span aria-hidden className="shrink-0 text-muted">
                  →
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {rules[trigger].map((suggestion) => (
                    <span
                      key={suggestion}
                      className="flex items-center rounded border border-border bg-surface pl-2 font-mono text-xs"
                    >
                      {suggestion}
                      <button
                        type="button"
                        onClick={() => removeSuggestion(trigger, suggestion)}
                        aria-label={`Stop ${trigger} offering ${suggestion}`}
                        className="flex min-h-7 items-center px-1.5 text-muted hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
