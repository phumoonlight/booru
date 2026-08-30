import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A Supabase client, whichever of the four made it.
 *
 * Helpers that take a client instead of building one are typed with this rather than
 * with `ServerClient`, because `ServerClient` is `Awaited<ReturnType<typeof createClient>>`
 * and reaching for that type means importing `server.ts`, which imports `next/headers`.
 * The desktop uploader (`packages/desktop`) shares those helpers and has no Next.
 */
export type BooruClient = SupabaseClient
