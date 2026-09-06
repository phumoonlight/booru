import { createRuleStore } from './rule-store'
import type { TagCatalogs } from '../../shared/catalogs'

/**
 * The named sets of tags. The same store the two rule sets use — read once for the whole
 * window, held outside React — because the reason is the same: the tag field on every card
 * in the queue consults them, and a copy per component is a file read per component.
 *
 * Written whole, unlike the rules: these are still a section of `save.json`, which is
 * rewritten either way, so there is nothing to be gained by sending less of it.
 */
const store = createRuleStore(
  () => window.api.listCatalogs(),
  (next: TagCatalogs) => window.api.saveCatalogs(next),
  {} as TagCatalogs
)

export const useCatalogs = store.use
export const saveCatalogs = store.save
export const reloadCatalogs = store.reload
