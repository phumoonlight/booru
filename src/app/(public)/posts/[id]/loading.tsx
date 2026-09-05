/**
 * Nothing, deliberately.
 *
 * This used to mirror the post page: the fixed viewport split, a pulsing image frame and
 * a sidebar of placeholder rows, so only the picture was left to arrive. That was right
 * while the page had one possible outcome. It has two now — the post, or the notice that
 * says the adult tiers are switched off — and the skeleton drew the first of them around
 * the second, so refusing a post began by painting a frame for it.
 *
 * A fallback that cannot know which page it is standing in for should stand in for
 * neither. The boundary still exists, which is what matters: it is what keeps this
 * segment from falling through to the *gallery's* skeleton one level up, which is what a
 * missing file here would do and what putting the check in a layout also did — a layout
 * renders outside this boundary, so its own wait belongs to the parent's.
 *
 * The wait it covers is two queries on an already-dynamic route, and the browser holds
 * the previous page until the first paint either way.
 */
export default function Loading() {
  return null
}
