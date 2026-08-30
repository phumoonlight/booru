// Pure — the landing page renders on the server, but nothing here needs a server.

/** Keycap emoji for 0–9. The variation selector is what makes them render as emoji. */
const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

/**
 * A count spelled in keycap emoji, the way the old boorus spelled theirs in digit
 * sprites: 333691 → 3️⃣3️⃣3️⃣,6️⃣9️⃣1️⃣. Thousands separators stay plain characters,
 * so the grouping still reads at a glance. Screen readers get the plain number —
 * a row of keycaps announces as "keycap three, keycap three, …" otherwise.
 */
export function emojiNumber(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  return safe
    .toLocaleString('en-US')
    .split('')
    .map((char) => (char >= '0' && char <= '9' ? KEYCAPS[Number(char)] : char))
    .join('')
}
