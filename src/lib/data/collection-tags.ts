import { cache } from 'react'
import { db } from '@/lib/db'
import { serving } from '@/lib/data/site'
import * as read from '@common/data/collection-tags'

/**
 * A shelf's own tags, bound to this host's pool and the maintenance gate — the pill bar
 * above a collection and the tags under one image.
 *
 * **No NSFW ceiling here**, unlike `lib/data/collections.ts`. Both are only ever read by a
 * page that has already read the shelf and decided whether to draw it, and a tag is a word
 * on a shelf rather than an image: a restricted shelf's page renders the notice before
 * either of these is asked.
 */

export type { CollectionTag } from '@common/data/collection-tags'

export const listCollectionTags = cache(async (collectionId: number) =>
  (await serving()) ? read.listCollectionTags(db(), collectionId) : []
)

export const listPostTags = cache(async (postId: number) =>
  (await serving()) ? read.listPostTags(db(), postId) : []
)
