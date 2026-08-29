export const TAG_CATEGORIES = ['artist', 'copyright', 'character', 'general', 'meta'] as const

export type TagCategory = (typeof TAG_CATEGORIES)[number]

export type Tag = {
  id: number
  name: string
  category: TagCategory
  post_count: number
}

export const TAG_PATTERN = /^[a-z0-9_().-]+$/

/**
 * Normalize free-text tag input (space/newline separated) into a clean,
 * deduped tag list. Returns invalid tokens separately for error messages.
 */
export function parseTagInput(input: string): {
  tags: string[]
  invalid: string[]
} {
  const tokens = input.toLowerCase().split(/\s+/).filter(Boolean)
  const tags: string[] = []
  const invalid: string[] = []
  for (const token of tokens) {
    if (!TAG_PATTERN.test(token)) {
      invalid.push(token)
    } else if (!tags.includes(token)) {
      tags.push(token)
    }
  }
  return { tags, invalid }
}

// Danbooru-style category colours, tuned for the dark theme. Here rather than beside the
// tag list they paint because the desktop uploader's tag field wants the same chips and
// imports no Next component (packages/post-app).
export const CATEGORY_COLOR: Record<TagCategory, string> = {
  artist: 'text-[#ff8a8b]',
  copyright: 'text-[#c797ff]',
  character: 'text-[#35c64a]',
  general: 'text-[#4fa3e3]',
  meta: 'text-[#ead084]',
}

export const CATEGORY_LABEL: Record<TagCategory, string> = {
  artist: 'Artist',
  copyright: 'Copyright',
  character: 'Character',
  general: 'General',
  meta: 'Meta',
}
