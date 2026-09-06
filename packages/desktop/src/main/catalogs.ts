import { clearSection, readSection, writeSection } from './save-file'
import { normalizeCatalogs, type TagCatalogs } from '../shared/catalogs'

/**
 * The tag catalogs as `save.json` holds them — a plain `{ name: [tag, …] }` object under
 * `catalogs`, the same shape as the two rule sections and for the same reason: it is worth
 * hand-editing, and pasting a set of thirty tags in is easier than adding them one at a time
 * on any screen anybody could draw.
 *
 * Main only stores them. Applying one is the tag field's job, in the window, where the tags
 * it adds are chips you can see and remove — see `shared/catalogs.ts`.
 */
export function loadCatalogs(): TagCatalogs {
  return normalizeCatalogs(readSection<unknown>('catalogs'))
}

/**
 * Normalises on the way in and answers with what was actually stored, so the screen paints
 * the catalogs the file holds rather than the ones it sent.
 *
 * Having none takes the section out rather than leaving `"catalogs": {}` behind. Note that
 * this is about *no catalogs at all*, not about an empty one: a catalog with nothing in it
 * yet is kept, which is `normalizeCatalogs`'s own decision and the thing that makes ➕ New
 * work.
 */
export function saveCatalogs(input: unknown): TagCatalogs {
  const next = normalizeCatalogs(input)
  if (Object.keys(next).length === 0) clearSection('catalogs')
  else writeSection('catalogs', next)
  return next
}
