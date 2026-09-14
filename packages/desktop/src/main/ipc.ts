/**
 * Every channel the window can reach. Each one is small on purpose: the renderer holds
 * no keys and no file access, so anything it needs is a request across here, and a
 * handler that doesn't exist is a capability the window doesn't have.
 *
 * The arguments arrive from a page and are treated that way — parsed, not trusted.
 *
 * **The board rides on the call.** Which of the two boards the window is in is the
 * renderer's state, and every channel that touches a post or a count takes it as an
 * argument rather than this process holding a mode. A mode here would be read at the top
 * of a handler, which is before every `await` in it: an upload begun on one board and
 * finished after the switch was flipped would land on the other, and nothing in the answer
 * would say so. It is parsed like everything else — `boardSchema` — because it picks a
 * table name.
 *
 * One file per group of channels — the app itself, images and posts, the vocabulary, the
 * shelves — because a single `registerIpc` was the one place in this process where every
 * unrelated capability was spelled next to every other.
 */
import { registerAppIpc } from './ipc-app'
import { registerArtistIpc } from './ipc-artists'
import { registerCollectionIpc } from './ipc-collections'
import { registerPostIpc } from './ipc-posts'
import { registerTagIpc } from './ipc-tags'

export function registerIpc(): void {
  registerAppIpc()
  registerPostIpc()
  registerTagIpc()
  registerCollectionIpc()
  registerArtistIpc()
}
