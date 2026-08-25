// Storage paths are derived from md5, never stored (docs/database-schema.md)

const base = () =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

export function originalUrl(md5: string, fileExt: string) {
  return `${base()}/originals/${md5}.${fileExt}`;
}

export function thumbnailUrl(md5: string) {
  return `${base()}/thumbnails/${md5}.webp`;
}

export function originalPath(md5: string, fileExt: string) {
  return `${md5}.${fileExt}`;
}

export function thumbnailPath(md5: string) {
  return `${md5}.webp`;
}
