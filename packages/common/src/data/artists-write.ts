import { ARTIST_TABLES, readArtistName, readArtistUrl } from '@common/artists'
import { first, isUniqueViolation, type Db, type DbPool } from '@common/db'
import type { ArtistImage, ArtistUrl } from '@common/data/artists'

/**
 * Everything that changes the artist list. Separate from the reads for the reason the
 * collections' writes are: every one of these has a failure worth wording, and none of the
 * reads do.
 */

const { artists, urls, images } = ARTIST_TABLES

export type ArtistOutcome<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Adds an artist, never read, as AI or not. The unique index on `lower(name)` decides a duplicate, and
 * is caught rather than asked about first — a check-then-insert is a second round trip and
 * a race.
 */
export async function createArtist(
  db: Db,
  rawName: string,
  isAi: boolean
): Promise<ArtistOutcome<{ id: number; name: string }>> {
  const read = readArtistName(rawName)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const [row] = await db<{ id: number }[]>`
      insert into ${db(artists)} ${db({ name: read.name, is_ai: isAi })} returning id`
    return { ok: true, id: row.id, name: read.name }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `There is already an artist called ${read.name}.` }
    }
    throw error
  }
}

export async function renameArtist(
  db: Db,
  id: number,
  rawName: string
): Promise<ArtistOutcome<{ name: string }>> {
  const read = readArtistName(rawName)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const updated = await db<{ id: number }[]>`
      update ${db(artists)} set name = ${read.name} where id = ${id} returning id`
    if (updated.length === 0) return { ok: false, error: 'No such artist.' }
    return { ok: true, name: read.name }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: `There is already an artist called ${read.name}.` }
    }
    throw error
  }
}

/** Moves an artist between the two lists. Not a rename and not a read: `read_at` stays, so
 *  they keep their place in the list they land in. */
export async function setArtistAi(db: Db, id: number, isAi: boolean): Promise<ArtistOutcome> {
  const updated = await db<{ id: number }[]>`
    update ${db(artists)} set is_ai = ${isAi} where id = ${id} returning id`
  return updated.length > 0 ? { ok: true } : { ok: false, error: 'No such artist.' }
}

/**
 * Caught up on this artist, now — which sends them to the bottom of the list.
 *
 * `now()` is the database's clock rather than the machine's: the list is ordered by these
 * stamps, and two installs whose clocks disagree would otherwise order one list two ways.
 * Answers with the stamp as stored, so the window can re-sort without a re-read.
 *
 * **Refused for an archived artist**, in the statement rather than by the window hiding the
 * button: there is nothing to catch up on, and a stale window must not move a read date the
 * archive list does not show.
 */
export async function markArtistRead(
  db: Db,
  id: number
): Promise<ArtistOutcome<{ read_at: string }>> {
  const row = first(
    await db<{ read_at: string }[]>`
      update ${db(artists)} set read_at = now() where id = ${id} and archived_at is null
      returning to_char(read_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as read_at`
  )
  if (row) return { ok: true, read_at: row.read_at }

  const exists = first(await db<{ id: number }[]>`select id from ${db(artists)} where id = ${id}`)
  return {
    ok: false,
    error: exists ? 'An archived artist cannot be marked read.' : 'No such artist.',
  }
}

/**
 * Moves an artist into the archive or back out of it, answering with the stamp as stored.
 *
 * Archiving one already archived keeps its date (`coalesce`) — a second press from a stale
 * window is not a second archiving. `read_at` is not touched either way, so an artist
 * brought back lands where their last read puts them.
 */
export async function setArtistArchived(
  db: Db,
  id: number,
  archived: boolean
): Promise<ArtistOutcome<{ archived_at: string | null }>> {
  const row = first(
    await db<{ archived_at: string | null }[]>`
      update ${db(artists)}
         set archived_at = case when ${archived}::bool then coalesce(archived_at, now()) end
       where id = ${id}
      returning to_char(archived_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as archived_at`
  )
  return row ? { ok: true, archived_at: row.archived_at } : { ok: false, error: 'No such artist.' }
}

/**
 * Adds an address. `artist_urls.url` is unique across every artist, so a refusal names
 * whoever already has it — that is how a second row for the same person, under a second
 * spelling of their handle, gets noticed.
 */
export async function addArtistUrl(
  db: Db,
  artistId: number,
  rawUrl: string
): Promise<ArtistOutcome<{ url: ArtistUrl }>> {
  const read = readArtistUrl(rawUrl)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const [row] = await db<ArtistUrl[]>`
      insert into ${db(urls)} ${db({ artist_id: artistId, url: read.url })}
      returning id, url`
    return { ok: true, url: row }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const owner = first(
      await db<{ name: string }[]>`
        select a.name from ${db(urls)} u join ${db(artists)} a on a.id = u.artist_id
         where u.url = ${read.url}`
    )
    return {
      ok: false,
      error: owner
        ? `That address is already saved for ${owner.name}.`
        : 'That address is already saved.',
    }
  }
}

export async function removeArtistUrl(db: Db, id: number): Promise<ArtistOutcome> {
  const gone = await db<{ id: number }[]>`delete from ${db(urls)} where id = ${id} returning id`
  return gone.length > 0 ? { ok: true } : { ok: false, error: 'No such address.' }
}

export type ArtistImageFields = Omit<ArtistImage, 'id'> & { artist_id: number; file_size: number }

export async function createArtistImage(db: Db, fields: ArtistImageFields): Promise<number> {
  const [row] = await db<{ id: number }[]>`
    insert into ${db(images)} ${db({ ...fields })} returning id`
  return row.id
}

/** Removes one example's row, answering with its name so the caller can remove the two
 *  stored objects — the row is the only thing that knows where they are. */
export async function deleteArtistImageRow(
  db: Db,
  id: number
): Promise<{ file_name: string; file_ext: string } | null> {
  return first(
    await db<{ file_name: string; file_ext: string }[]>`
      delete from ${db(images)} where id = ${id} returning file_name, file_ext`
  )
}

/**
 * Deletes an artist with its addresses and example images, answering with the images that
 * went so their stored objects can follow. Null for an artist that was not there.
 *
 * A transaction, and it takes the pool: the images are deleted by hand first rather than
 * left to the cascade, because the cascade would not say which names it took, and those
 * names are the only way to find the objects afterwards.
 */
export async function deleteArtistRows(
  db: DbPool,
  id: number
): Promise<{ file_name: string; file_ext: string }[] | null> {
  return db.begin(async (tx) => {
    const gone = await tx<{ file_name: string; file_ext: string }[]>`
      delete from ${tx(images)} where artist_id = ${id} returning file_name, file_ext`
    const artist = await tx<{ id: number }[]>`
      delete from ${tx(artists)} where id = ${id} returning id`
    return artist.length > 0 ? [...gone] : null
  })
}
