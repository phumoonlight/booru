import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cookie-less anonymous client. Reading cookies would make a route dynamic, so
 * cacheable session-independent reads (the sitemap) use this instead of
 * `server.ts`. RLS still applies — this sees exactly what a logged-out visitor does.
 */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
