/**
 * Every channel the window can reach. Each one is small on purpose: the renderer holds
 * no keys and no file access, so anything it needs is a request across here, and a
 * handler that doesn't exist is a capability the window doesn't have.
 *
 * The arguments arrive from a page and are treated that way — parsed, not trusted.
 *
 * One file per group of channels — the app itself, picking and staging files, the
 * vocabulary, the shelves, the artists — because a single `registerIpc` was the one place
 * in this process where every unrelated capability was spelled next to every other.
 */
import { registerAppIpc } from './ipc-app'
import { registerArtistIpc } from './ipc-artists'
import { registerCollectionIpc } from './ipc-collections'
import { registerFileIpc } from './ipc-files'
import { registerTagIpc } from './ipc-tags'

export function registerIpc(): void {
  registerAppIpc()
  registerFileIpc()
  registerTagIpc()
  registerCollectionIpc()
  registerArtistIpc()
}
