// Storage paths are derived from md5, never stored (docs/database-schema.md)

export const POSTS_BUCKET = 'posts'
export const THUMBNAILS_BUCKET = 'post-thumbnails'

const base = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`

// The stored post image is AVIF when lossless AVIF beat the upload, otherwise
// the uploaded file byte-for-byte — `fileExt` says which (see actions/upload.ts).
export function postImageUrl(md5: string, fileExt: string) {
  return `${base()}/${POSTS_BUCKET}/${md5}.${fileExt}`
}

export function thumbnailUrl(md5: string) {
  return `${base()}/${THUMBNAILS_BUCKET}/${md5}.avif`
}

export function postImagePath(md5: string, fileExt: string) {
  return `${md5}.${fileExt}`
}

export function thumbnailPath(md5: string) {
  return `${md5}.avif`
}
