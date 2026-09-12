import { z } from 'zod'
import { BOARDS, type Board } from '@common/board'

/**
 * What more than one group of handlers has to parse.
 *
 * Three exports where most files here have two, for the reason `@common/board` has six:
 * this is the one place the bridge's shared shapes are spelled, and a second definition of
 * "a board" or "an id" in another handler file is exactly the disagreement the split would
 * otherwise buy.
 */

export const postIdSchema = z.number().int().positive()

/**
 * Which board a call is about. Defaulted to the gallery, so a message from an older
 * renderer — or one of the handlers that has no board to send — means what it always did.
 */
export const boardSchema = z.enum(BOARDS).optional().default('post')

/**
 * The board off a positional argument, for the handlers that take one beside an id.
 *
 * `parse`, not `safeParse`: absent is a legitimate message and becomes the gallery, but a
 * value that is *present and not a board* is a bug in the window, and answering it by
 * quietly writing to the gallery is how a post lands where nobody sent it. It can only be
 * reached from this bundle, so the throw is a bridge error nobody will ever see.
 */
export function readBoard(raw: unknown): Board {
  return boardSchema.parse(raw)
}
