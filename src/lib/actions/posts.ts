'use server'

import { isBoard, type Board } from '@common/board'
import { incrementPostView } from '@/lib/data/posts'

/**
 * The website's only action, and the only write it makes.
 *
 * Editing and deleting posts used to live here too, behind `requireUser()`. Both moved
 * to the desktop app when the board lost its login: the anon key the site holds cannot
 * write a row, and there is no session left for an action to check.
 *
 * Called from the browser once a post page is actually looked at — never on a read
 * path, so prefetches, `generateMetadata` and crawlers don't inflate the number. It
 * takes no user: a view is the one row change an anonymous visitor is allowed to cause,
 * and the id and the board are the whole of what reaches the database.
 *
 * The board arrives from the browser like the id does, so it is checked the same way —
 * `isBoard` rather than a cast, since it picks a table name. A nonsense value counts
 * nothing rather than guessing at the gallery, which would attribute an AI post's view to
 * whatever row holds that id on the other board.
 */
export async function recordPostView(postId: number, board: Board = 'post') {
  if (!Number.isInteger(postId) || postId < 1) return
  if (!isBoard(board)) return
  await incrementPostView(postId, board)
}
