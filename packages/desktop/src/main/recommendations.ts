import { clearSection, readSection, writeSection } from './save-file'
import { normalizeRecommendations, type RecommendationRules } from '../shared/recommendations'

/**
 * The recommendation rules as `save.json` holds them, under `recommendations` and in the
 * same `{ tag: [suggested, …] }` shape the implications use. Two sections rather than one
 * because they are two different promises: what goes on the post by itself, and what is
 * merely offered — `shared/recommendations.ts` has the difference.
 *
 * Main only stores them. Offering one is the tag field's job, in the window.
 */
export function loadRecommendations(): RecommendationRules {
  return normalizeRecommendations(readSection<unknown>('recommendations'))
}

/** Normalises on the way in and answers with what was stored, like the implications do. */
export function saveRecommendations(input: unknown): RecommendationRules {
  const next = normalizeRecommendations(input)
  if (Object.keys(next).length === 0) clearSection('recommendations')
  else writeSection('recommendations', next)
  return next
}
