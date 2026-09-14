import { ARTIST_TABLES } from '@common/artists'
import { first, type Db } from '@common/db'

/**
 * The artist list, as reads. The writes are `@common/data/artists-write`.
 *
 * Only the desktop app calls these — `booru_web` has no grant on the tables, so the website
 * could not if it tried — and they take a `Db` like every other module here (invariant 3).
 */

export type ArtistUrl = { id: number; url: string }

/** An example image: enough to name its two stored objects and draw it the right shape. */
export type ArtistImage = {
  id: number
  file_name: string
  file_ext: string
  width: number
  height: number
}

export type Artist = {
  id: number
  name: string
  /** AI-generated work. The screen shows one kind at a time, so this splits the list. */
  is_ai: boolean
  /** ISO-8601, or null for never — which sorts above every date. */
  read_at: string | null
  /** ISO-8601 when the artist was moved to the archive, or null while on the reading list. */
  archived_at: string | null
  urls: ArtistUrl[]
  images: ArtistImage[]
}

const { artists, urls, images } = ARTIST_TABLES

/**
 * Every artist, the one most overdue a visit first: `read_at` oldest to newest, never-read
 * above all of them, and the id as the tiebreak so two added together keep the order they
 * were added in. Ordered by the column (`a.read_at`), not the formatted alias, so the index
 * serves it.
 *
 * Whole, with addresses and images, in three statements rather than one aggregate: the list
 * is somebody's reading list rather than a board, so it is tens or hundreds of rows, and
 * three plain selects grouped here read more plainly than a `json_agg` per column.
 */
export async function listArtists(db: Db): Promise<Artist[]> {
  const [rows, urlRows, imageRows] = await Promise.all([
    db<
      {
        id: number
        name: string
        is_ai: boolean
        read_at: string | null
        archived_at: string | null
      }[]
    >`
      select a.id, a.name, a.is_ai,
             to_char(a.read_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as read_at,
             to_char(a.archived_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as archived_at
        from ${db(artists)} a
       order by a.read_at asc nulls first, a.id asc`,
    db<(ArtistUrl & { artist_id: number })[]>`
      select id, artist_id, url from ${db(urls)} order by artist_id, id`,
    db<(ArtistImage & { artist_id: number })[]>`
      select id, artist_id, file_name, file_ext, width, height
        from ${db(images)} order by artist_id, id`,
  ])

  const byArtist = new Map<number, Artist>(
    rows.map((row) => [row.id, { ...row, urls: [], images: [] }])
  )
  for (const { artist_id, ...url } of urlRows) byArtist.get(artist_id)?.urls.push(url)
  for (const { artist_id, ...image } of imageRows) byArtist.get(artist_id)?.images.push(image)
  return [...byArtist.values()]
}

export async function getArtistImage(
  db: Db,
  id: number
): Promise<(ArtistImage & { artist_id: number }) | null> {
  return first(
    await db<(ArtistImage & { artist_id: number })[]>`
      select id, artist_id, file_name, file_ext, width, height
        from ${db(images)} where id = ${id}`
  )
}

/**
 * Which of these bytes are already an example, and whose — the dedup question, asked at
 * staging for a batch and by the pipeline for one. A `file_name` is unique across the
 * table, so the answer names the artist: "already an example for Hiten" can be acted on.
 */
export async function findArtistImagesByFileNames(
  db: Db,
  fileNames: string[]
): Promise<Map<string, { id: number; artist_name: string }>> {
  if (fileNames.length === 0) return new Map()

  const rows = await db<{ id: number; file_name: string; artist_name: string }[]>`
    select i.id, i.file_name, a.name as artist_name
      from ${db(images)} i
      join ${db(artists)} a on a.id = i.artist_id
     where i.file_name = any(${fileNames})`
  return new Map(rows.map((row) => [row.file_name, { id: row.id, artist_name: row.artist_name }]))
}
