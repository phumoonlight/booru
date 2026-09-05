'use server'

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
 * and the id is the whole of what reaches the database.
 */
export async function recordPostView(postId: number) {
  if (!Number.isInteger(postId) || postId < 1) return
  await incrementPostView(postId)
}
