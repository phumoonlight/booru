// Storage paths are derived from `posts.file_name`, never stored
// (docs/database-schema.md). That column holds the md5 of the uploaded bytes, but
// nothing here needs to know it — a path is a name plus an extension.

export const POSTS_BUCKET = 'posts'
export const THUMBNAILS_BUCKET = 'post-thumbnails'

const base = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`

// The stored post image is AVIF when the AVIF candidate beat the upload, otherwise the
// uploaded file byte-for-byte — `fileExt` says which (see `@common/upload/pipeline`).
export function postImageUrl(fileName: string, fileExt: string) {
  return `${base()}/${POSTS_BUCKET}/${fileName}.${fileExt}`
}

export function thumbnailUrl(fileName: string) {
  return `${base()}/${THUMBNAILS_BUCKET}/${fileName}.avif`
}

export function postImagePath(fileName: string, fileExt: string) {
  return `${fileName}.${fileExt}`
}

export function thumbnailPath(fileName: string) {
  return `${fileName}.avif`
}
