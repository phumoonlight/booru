import { z } from 'zod'

/**
 * What more than one group of handlers has to parse: a row's id. Spelled once, because a
 * second definition of "an id" in another handler file is exactly the disagreement a shared
 * shape is there to prevent.
 *
 * This file also held the board a call was about, until the boards were dropped (0012).
 */
export const postIdSchema = z.number().int().positive()
