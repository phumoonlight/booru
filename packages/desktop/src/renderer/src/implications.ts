import { createRuleStore } from './rule-store'
import type { ImplicationRules } from '../../shared/implications'

/** The rules the app applies by itself. `rule-store.ts` has why they live out here. */
const store = createRuleStore(
  () => window.api.listRules('implies'),
  (tag: string, names: string[]) => window.api.saveRule('implies', tag, names),
  {} as ImplicationRules
)

export const useImplications = store.use
export const saveImplication = store.save
export const reloadImplications = store.reload
