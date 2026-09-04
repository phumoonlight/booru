import { createRuleStore } from './rule-store'
import type { RecommendationRules } from '../../shared/recommendations'

/** The rules the app only offers. Same store, a different section of `save.json`. */
const store = createRuleStore<RecommendationRules>(
  () => window.api.listRecommendations(),
  (next) => window.api.saveRecommendations(next),
  {}
)

export const useRecommendations = store.use
export const saveRecommendations = store.save
