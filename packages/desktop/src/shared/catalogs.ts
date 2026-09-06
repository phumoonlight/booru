import { TAG_PATTERN } from '@common/tags'

/**
 * Tag catalogs: a set of tags with a name on it — "Blue Archive · Hoshino", "my usual
 * meta" — kept so it can be dropped onto a post in one press.
 *
 * The third thing in `save.json` that answers "what else goes on this post?", and the only
 * one that answers it by being *asked*. An implication fires by itself and a recommendation
 * offers itself; a catalog does neither until it is picked by name, which is what makes it
 * the right shape for the tags that are true of a whole set of images rather than of a tag.
 * Importing one post's tags already covered that case and covered it badly: the post has to
 * still exist, you have to find it, and page seven of a set is seven searches.
 *
 * **Names only, no categories.** Everything that draws a tag colours it by category, so a
 * catalog could have stored one — and would then be wrong the first time a tag is
 * recategorized on the Tags screen. The category is looked up in the board's own index at
 * the moment the catalog is applied, which is what `CategoryTagField` already does for a
 * recommended chip. It is also what keeps a catalog readable in a file you may hand-edit.
 *
 * **No rating**, for the reason the recommendations have none: a rating belongs to the
 * picture, not to a set of tags that happens to describe several of them. `TAG_PATTERN`
 * drops a `rating:` token on its colon for free.
 *
 * Pure, and in `shared/` because both sides need it: main normalises what it stores, the
 * window applies it while tagging.
 */
export type TagCatalogs = Record<string, string[]>

/** As long as a name can be and still be read whole on a menu row. */
export const CATALOG_NAME_MAX = 60

/**
 * A catalog's name as it is stored: trimmed, its inner runs of whitespace collapsed, its
 * control characters gone, and capped. Empty means "not a name" — the one thing a catalog
 * cannot be called.
 *
 * Case is kept, unlike a tag's. This is a label a person wrote for themselves and reads off
 * a menu, not a name the board has to agree about.
 */
export function catalogName(raw: string): string {
  return raw
    // Control characters read as nothing on a menu row but would still be in the key
    .replace(/\p{C}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CATALOG_NAME_MAX)
}

/**
 * The stored shape, parsed rather than trusted — `save.json` is a file the user is invited
 * to hand-edit, and this is the validation for the IPC channel too, stricter than a zod
 * schema of the same shape since every tag must match the board's own `TAG_PATTERN`.
 *
 * Keys come out sorted, so the file stays something you can read down.
 *
 * **An empty catalog survives**, which is where this parts company with the two rule
 * sections. A rule that implies nothing is not a rule, and dropping it is how the last ✕
 * deletes one; a catalog with no tags in it yet is the ordinary first second of building
 * one — named, then filled — and a normalize that swallowed it would make ➕ New do
 * nothing at all. Deleting a catalog is its own button.
 */
export function normalizeCatalogs(input: unknown): TagCatalogs {
  const out: TagCatalogs = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out

  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    const name = catalogName(key)
    if (!name) continue

    const raw = (input as Record<string, unknown>)[key]
    if (!Array.isArray(raw)) continue

    const tags: string[] = []
    for (const entry of raw) {
      if (typeof entry !== 'string') continue
      const tag = entry.trim().toLowerCase()
      if (!TAG_PATTERN.test(tag) || tags.includes(tag)) continue
      tags.push(tag)
    }
    out[name] = tags
  }
  return out
}

/**
 * Adds or removes one tag from a catalog, leaving the catalog itself alone either way —
 * emptying it is not deleting it. The other half of the gesture is the tag grid in
 * `tag-index.tsx`, which is why this is here rather than inside the panel that starts it.
 */
export function toggleCatalogTag(catalogs: TagCatalogs, name: string, tag: string): TagCatalogs {
  const current = catalogs[name] ?? []
  return {
    ...catalogs,
    [name]: current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag],
  }
}

/** Renames one catalog, keeping its tags. `normalizeCatalogs` puts it back in order. */
export function renameCatalog(catalogs: TagCatalogs, from: string, to: string): TagCatalogs {
  const next: TagCatalogs = { ...catalogs, [to]: catalogs[from] ?? [] }
  if (to !== from) delete next[from]
  return next
}
