import { ipcMain } from 'electron'
import { z } from 'zod'
import { listTags } from '@common/data/shared'
import * as manageTags from '@common/data/tags'
import { TAG_CATEGORIES } from '@common/tags'
import { loadRules, saveRule } from './rules'
import { loadFormSections, saveFormSections } from './form-sections'
import { cachedIndex, clearTagCache, TAG_INDEX_LIMIT } from './tag-cache'
import { boardDb } from './db'
import { postIdSchema } from './ipc-parse'
import type { FormSections } from '@common/data/form-sections'
import type { TagRules } from '@common/data/rules'
import type { Tag } from '@common/tags'

const tagNameSchema = z.string().max(64)
// A ceiling, not the rule: `normalizeFormSection` settles the spelling of what gets
// through, and the unique constraint on `(category, name)` settles the rest.
const sectionSchema = z.string().max(64)
// A ceiling, not a rule: `readTagMark` is what decides a mark is a colour, or up to three
// glyphs, and not a bracket — and it answers a message the field can show. This only keeps
// a paste of a paragraph from reaching the board at all — generous, because three ZWJ
// sequences are a great many UTF-16 units and this is not the check that counts them.
const markSchema = z.string().max(96)
// The known list, which is also the only list with a colour and a place in the display
// order. A category outside it can only arrive by hand-editing the table.
const categorySchema = z.enum(TAG_CATEGORIES)
// Which of the three rule sets a channel is talking about. The same strings the table's
// `kind` column is checked against, so an unknown one is refused here rather than by a
// constraint violation three calls later.
// The five shapes one edit to the sections can take. A discriminated union rather than five
// channels — see the handler. It has to name every member of `FormSectionEdit`: a shape
// missing here is refused at the bridge, which is a channel error rather than the typed
// failure the panel knows how to show.
const sectionEditSchema = z.discriminatedUnion('do', [
  z.object({ do: z.literal('create'), name: sectionSchema }),
  z.object({ do: z.literal('rename'), id: z.number().int().positive(), name: sectionSchema }),
  z.object({ do: z.literal('delete'), id: z.number().int().positive() }),
  z.object({
    do: z.literal('reorder'),
    // Both columns, each in its new order — a row's side and its place in it are one
    // arrangement, so they are one edit.
    columns: z.tuple([
      z.array(z.number().int().positive()).max(200),
      z.array(z.number().int().positive()).max(200),
    ]),
  }),
  z.object({
    do: z.literal('deps'),
    id: z.number().int().positive(),
    mode: z.enum(['any', 'all']),
    // Names, checked against the board by `resolveTagIds` inside — which refuses one it has
    // no tag for, the same refusal a post write and a tag rule make.
    names: z.array(z.string().max(64)).max(100),
  }),
])

const ruleKindSchema = z.enum(['implies', 'recommends'])

/** The tag index, the rules written about a tag, the rows of the form, and the operations
 *  that were the website's /tags/manage before the board lost its login. */
export function registerTagIpc(): void {
  ipcMain.handle('tags:list', async (): Promise<Tag[]> => {
    // The cache is the same read, kept for a day — `main/tag-cache.ts`. It falls through
    // to the board only when there is nothing cached and nothing it could fill from.
    const cached = await cachedIndex()
    if (cached) return cached

    const db = boardDb()
    if (!db) return []
    return listTags(db, TAG_INDEX_LIMIT)
  })

  /**
   * Throws the cached index away, for when it has somehow gone wrong — a tag renamed on
   * the board, a machine whose clock jumped. The next lookup reads the board again, so
   * there is nothing to confirm and nothing to wait for.
   */
  ipcMain.handle('tags:clear-cache', async (): Promise<void> => clearTagCache())
  /**
   * The tag rules, which are the board's now rather than this machine's — they moved off
   * `save.json` and onto `tag_rules`, so they follow a rename, die with a delete, and are
   * the same rules on every install.
   *
   * `rules:save` writes one tag's whole list rather than the whole map. The panel that
   * edits a rule has exactly one tag open, so that is what it was always sending; what
   * changed is that the write now touches that tag alone instead of rewriting a file.
   */
  ipcMain.handle('rules:list', async (_event, kind: unknown): Promise<TagRules> =>
    loadRules(ruleKindSchema.parse(kind))
  )

  // Only the kind and the trigger are checked here. The list itself goes through
  // `normalizeRules` inside, which is the parse and a stricter one — it holds every name
  // to the board's own `TAG_PATTERN`, which a schema of this shape would not, and the
  // write beneath it refuses any name the board has no tag for.
  ipcMain.handle(
    'rules:save',
    async (_event, kind: unknown, tag: unknown, raw: unknown): Promise<TagRules> =>
      saveRule(ruleKindSchema.parse(kind), z.string().parse(tag), raw)
  )

  /**
   * The rows the tag form draws, their order, and what each waits for —
   * `tag_form_sections`. One edit per write, in five shapes: a row has an id, so creating,
   * renaming, deleting, reordering and setting a condition are things done to a row rather
   * than five ways of restating a list. `normalizeFormSection` and `resolveTagIds` inside
   * are the parse.
   */
  ipcMain.handle('sections:list', async (): Promise<FormSections> => loadFormSections())

  // One channel for the four things you can do to a section, because they are four shapes
  // of one edit and the union is the schema. Four channels would be four handlers saying
  // "read the client, apply, read back".
  ipcMain.handle('sections:save', async (_event, edit: unknown) => {
    const parsed = sectionEditSchema.safeParse(edit)
    if (!parsed.success) throw new Error('That is not an edit to a section.')
    return saveFormSections(parsed.data)
  })

  // ── The tag vocabulary ───────────────────────────────────────────────
  // The operations that were /tags/manage. Each one answers `{ ok }` or
  // `{ error }`; the validation is `@common/data/tags`, which is also what the web's
  // forms used, so a name rejected here is rejected in the same words.
  //
  // Every one of them drops the cached index: a rename, a delete or a category change
  // makes the copy on disk wrong about a name the field is about to offer.

  ipcMain.handle(
    'tags:create',
    async (_event, name: unknown, category: unknown, section: unknown) => {
      const db = boardDb()
      if (!db) return { ok: false as const, error: 'Not set up yet' }
      const parsedName = tagNameSchema.safeParse(name)
      const parsedCategory = categorySchema.safeParse(category)
      if (!parsedName.success) return { ok: false as const, error: 'Type a tag name.' }
      if (!parsedCategory.success) return { ok: false as const, error: 'Pick a category.' }

      const result = await manageTags.createTag(
        db,
        parsedName.data,
        parsedCategory.data,
        z.number().int().positive().nullable().safeParse(section).data ?? null
      )
      if (result.ok) clearTagCache()
      return result
    }
  )

  ipcMain.handle('tags:rename', async (_event, id: unknown, name: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsedName = tagNameSchema.safeParse(name)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsedName.success) return { ok: false as const, error: 'Type a tag name.' }

    const result = await manageTags.renameTag(db, parsedId.data, parsedName.data)
    if (result.ok) clearTagCache()
    return result
  })

  ipcMain.handle('tags:set-category', async (_event, id: unknown, category: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsedCategory = categorySchema.safeParse(category)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsedCategory.success) return { ok: false as const, error: 'Pick a category.' }

    const result = await manageTags.setTagCategory(db, parsedId.data, parsedCategory.data)
    if (result.ok) clearTagCache()
    return result
  })

  /**
   * Which row of the tag form the tag sits on inside its category. Its own channel rather
   * than a field on `tags:set-category`, because the two move independently — moving a tag
   * to another category is a claim about what it is, and this is only about where the form
   * draws it.
   */
  ipcMain.handle('tags:set-section', async (_event, id: unknown, sectionId: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    // Null is the answer for "on no row", which is what the menu's empty option sends.
    const parsed = z.number().int().positive().nullable().safeParse(sectionId)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsed.success) return { ok: false as const, error: 'No such section' }

    const result = await manageTags.setTagFormSection(db, parsedId.data, parsed.data)
    if (result.ok) clearTagCache()
    return result
  })

  /** What is drawn in front of the tag's name — `tags.mark`. '' clears it. */
  ipcMain.handle('tags:set-mark', async (_event, id: unknown, mark: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    const parsed = markSchema.safeParse(mark)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }
    if (!parsed.success) return { ok: false as const, error: 'That is too long for a mark.' }

    const result = await manageTags.setTagMark(db, parsedId.data, parsed.data)
    if (result.ok) clearTagCache()
    return result
  })

  ipcMain.handle('tags:delete', async (_event, id: unknown) => {
    const db = boardDb()
    if (!db) return { ok: false as const, error: 'Not set up yet' }
    const parsedId = postIdSchema.safeParse(id)
    if (!parsedId.success) return { ok: false as const, error: 'No such tag' }

    const result = await manageTags.deleteTag(db, parsedId.data)
    if (result.ok) clearTagCache()
    return result
  })
}
