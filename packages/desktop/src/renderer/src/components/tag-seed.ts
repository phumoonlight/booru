import type { TagCategory } from '@common/tags'

/**
 * A chosen tag as the window holds one before it is written: the name, and the category
 * it belongs to.
 *
 * The category rides along because everything that draws a tag colours it by category —
 * the chips on a queue card, the picker, the post editor — and looking it up per render
 * would be a lookup per chip against an index the field already had in hand when the tag
 * was chosen.
 *
 * It has its own file because it outlived the component it was defined in. `TagField`, a
 * free-text box of names with an autocomplete, was the tag rules screen's and only that;
 * the rules are written by picking from the Tags grid now (`tag-rule-editor.tsx`), so the
 * box went with the screen and this type is what four other modules were importing from it.
 */
export type TagSeed = { name: string; category: TagCategory }
