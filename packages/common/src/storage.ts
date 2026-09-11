/**
 * Where an image lives, and what may be done to it.
 *
 * Paths are derived from `posts.file_name` and never stored — that column holds the md5
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

import { BOARD, type Board } from '@common/board'

/**
 * **Two prefixes per board, and the board picks them** (`@common/board`). The gallery
 * keeps the two it has always had — `posts/` and `thumbs/`, so not one stored object
 * moves — and the generated board gets its own folder beside them rather than its own
 * bucket, which is the same trade this file already made once: a bucket is a public
 * hostname, a prefix is free.
 *
 * `posts/<name>.<ext>` is the AVIF when it beat the uploaded bytes and the original
 * byte-for-byte otherwise; `file_ext` says which (see `@common/upload/pipeline`).
 * `thumbs/<name>.avif` is always AVIF and always 384px tall.
 */
export function postImagePath(fileName: string, fileExt: string, board: Board = 'post'): string {
  return `${BOARD[board].postPrefix}/${fileName}.${fileExt}`
}

export function thumbnailPath(fileName: string, board: Board = 'post'): string {
  return `${BOARD[board].thumbPrefix}/${fileName}.avif`
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
