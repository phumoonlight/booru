import { useSyncExternalStore } from 'react'
import { BOARD, isBoard, type Board } from '@common/board'

/**
 * Which board this window is working on — the gallery, or the generated images.
 *
 * **A mode, not a prop.** It is read by the upload form, the browse grid, the post
 * editor, the tag field's autocomplete and the Tags screen, which is most of the app and
 * three levels of nesting; threading it through would have been a `board` on every
 * component between the header and the thing that actually calls an IPC channel. It is a
 * module-level store for the same reason Browse keeps its query in one and the tag rules
 * live in `rule-store.ts`: the screens unmount whenever something is in front of them,
 * and a mode that reset when you glanced at About would be a mode nobody could trust.
 *
 * **It is deliberately not in the main process.** A mode held there is read at the top of
 * a handler, which is before every `await` in it — an upload begun on one board and
 * finished after the switch was flipped would land on the other, with nothing in the
 * answer to say so. So the board travels with each call, and this is where the call gets
 * it.
 *
 * It is not written to `save.json` either. Which board you were last on is a fact about a
 * session, not a preference: opening the app on the AI board a week later, having
 * forgotten, is how a post ends up on the wrong one. The window opens on the gallery.
 */

let board: Board = 'post'
const listeners = new Set<() => void>()

/** The board a call should carry. For anything outside React — an event handler, an
 *  async continuation — where the hook's value may be a render behind. */
export function currentBoard(): Board {
  return board
}

export function setBoard(next: Board): void {
  // Guarded because this is also where a value read back from anywhere else would land,
  // and because a no-op switch must not re-render every screen that reads it.
  if (!isBoard(next) || next === board) return
  board = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The board, as state. Anything drawn differently per board reads it through this. */
export function useBoard(): Board {
  return useSyncExternalStore(subscribe, currentBoard, currentBoard)
}

/** What a board is called on a heading or a switch — one spelling, from `@common/board`. */
export function boardLabel(on: Board): string {
  return BOARD[on].label
}

/**
 * The glyph in front of that label. Here rather than in `@common/board`, which is compiled
 * by the website too and has no business holding this window's decoration.
 */
export const BOARD_EMOJI: Record<Board, string> = {
  post: '🖼️',
  generative: '🤖',
}
