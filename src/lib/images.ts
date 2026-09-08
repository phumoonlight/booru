import { imageUrl, postImagePath, thumbnailPath } from '@common/storage'

/**
 * Where the website looks for an image — `@common/storage`'s path builders with this
 * host's base filled in.
 *
 * The base used to be read inside `@common/storage` itself, off
 * `NEXT_PUBLIC_SUPABASE_URL`, which broke the rule that nothing in `packages/common`
 * reads the environment (invariant 4) and quietly made a shared module part of one
 * host's configuration. It is supplied here now, and the desktop app supplies its own
 * from the value compiled into its bundle.
 *
 * No `server-only`: the grid's card is a client component, and `NEXT_PUBLIC_CDN_URL` is
 * inlined at build the way every public variable is. There is nothing secret about the
 * origin images are served from — it is in the markup of every page.
 */
const base = () => (process.env.NEXT_PUBLIC_CDN_URL ?? '').replace(/\/+$/, '')

export function postImageUrl(fileName: string, fileExt: string): string {
  return imageUrl(base(), postImagePath(fileName, fileExt))
}

export function thumbnailUrl(fileName: string): string {
  return imageUrl(base(), thumbnailPath(fileName))
}
