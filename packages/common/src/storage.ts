/**
 * Where an image lives, and what may be done to it.
 *
 * Paths are derived from `file_name` and never stored — that column holds the md5
 * of the uploaded bytes, but nothing here needs to know it: a path is a name, a prefix
 * and an extension.
 *
 * **One bucket, two prefixes**, where this was two buckets. Each bucket needs its own
 * public hostname, and the two held the same kind of thing under two names for no
 * reason a URL could see; a prefix costs nothing and leaves one domain to point at one
 * place.
 *
 * **Nothing here reads the environment.** It used to build URLs off
 * `NEXT_PUBLIC_SUPABASE_URL`, which quietly broke the rule that `packages/common` reads
 * no environment (invariant 4) and made the desktop app set that variable on itself at
 * startup just so a shared module would find it. The base is an argument now, and each
 * host supplies its own — the website from `NEXT_PUBLIC_CDN_URL`, the desktop from the
 * value compiled into its bundle.
 */

import { ARTIST_IMAGE_PREFIX, ARTIST_THUMB_PREFIX } from '@common/artists'
import { COLLECTION_POST_PREFIX, COLLECTION_THUMB_PREFIX } from '@common/collections'

/**
 * A collection image and its thumbnail — `collections/posts/<name>.<ext>` and
 * `collections/thumbs/<name>.avif`.
 *
 * `…/posts/<name>.<ext>` is the AVIF when it beat the uploaded bytes and the original
 * byte-for-byte otherwise; `file_ext` says which (see `@common/upload/pipeline`). The
 * thumbnail is always AVIF and always 384px tall.
 *
 * The boards' pairs — `posts/`, `thumbs/`, `generative/…` — went with their tables (0012);
 * the objects under them are orphans nothing names.
 */
export function collectionImagePath(fileName: string, fileExt: string): string {
  return `${COLLECTION_POST_PREFIX}/${fileName}.${fileExt}`
}

export function collectionThumbnailPath(fileName: string): string {
  return `${COLLECTION_THUMB_PREFIX}/${fileName}.avif`
}

/** An artist's example image and its thumbnail — `artists/images/<name>.<ext>` and
 *  `artists/thumbs/<name>.avif`. The same encode, one more prefix. */
export function artistImagePath(fileName: string, fileExt: string): string {
  return `${ARTIST_IMAGE_PREFIX}/${fileName}.${fileExt}`
}

export function artistThumbnailPath(fileName: string): string {
  return `${ARTIST_THUMB_PREFIX}/${fileName}.avif`
}

/** The public URL of a stored object. `base` is the bucket's public origin, with no
 *  trailing slash — both hosts strip one before they ever get here. */
export function imageUrl(base: string, path: string): string {
  return `${base}/${path}`
}

/**
 * What the upload pipeline needs of a bucket, and the whole of it: put an object, take
 * one away.
 *
 * An interface rather than a client, for the same reason every function in
 * `@common/data/*` takes a handle it did not build — `packages/common` compiles inside
 * Electron's main process and inside a server render, and a module that reached for an
 * S3 client would tie the pipeline to one of them. The desktop implements this against
 * R2 in `main/r2.ts`; nothing else implements it, because nothing else writes.
 */
export type ObjectStore = {
  put(path: string, bytes: Buffer, contentType: string): Promise<void>
  remove(path: string): Promise<void>
}
