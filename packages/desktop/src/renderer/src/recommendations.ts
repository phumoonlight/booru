import { createRuleStore } from './rule-store'
import type { RecommendationRules } from '../../shared/recommendations'

/** The rules the app only offers. Same store, the other `kind` of the same table. */
const store = createRuleStore(
  () => window.api.listRules('recommends'),
  (tag: string, names: string[]) => window.api.saveRule('recommends', tag, names),
  {} as RecommendationRules
)

export const useRecommendations = store.use
export const saveRecommendation = store.save
export const reloadRecommendations = store.reload
