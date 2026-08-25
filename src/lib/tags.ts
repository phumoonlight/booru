export const TAG_PATTERN = /^[a-z0-9_().-]+$/;

/**
 * Normalize free-text tag input (space/newline separated) into a clean,
 * deduped tag list. Returns invalid tokens separately for error messages.
 */
export function parseTagInput(input: string): {
  tags: string[];
  invalid: string[];
} {
  const tokens = input.toLowerCase().split(/\s+/).filter(Boolean);
  const tags: string[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    if (!TAG_PATTERN.test(token)) {
      invalid.push(token);
    } else if (!tags.includes(token)) {
      tags.push(token);
    }
  }
  return { tags, invalid };
}
