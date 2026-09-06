import { createRuleStore } from './rule-store'
import type { TagCatalogs } from '../../shared/catalogs'

/**
 * The named sets of tags. The same store the two rule sets use — read once for the whole
 * window, written whole, held outside React — because the reason is the same: the tag field
 * on every card in the queue consults them, and a copy per component is a file read per
 * component.
 */
const store = createRuleStore<TagCatalogs>(
  () => window.api.listCatalogs(),
  (next) => window.api.saveCatalogs(next),
  {}
)

export const useCatalogs = store.use
export const saveCatalogs = store.save
export const reloadCatalogs = store.reload
