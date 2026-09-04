import { createRuleStore } from './rule-store'
import type { ImplicationRules } from '../../shared/implications'

/** The rules the app applies by itself. `rule-store.ts` has why they live out here. */
const store = createRuleStore<ImplicationRules>(
  () => window.api.listImplications(),
  (next) => window.api.saveImplications(next),
  {}
)

export const useImplications = store.use
export const saveImplications = store.save
