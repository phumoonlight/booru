import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { exportConfigToEnv, loadConfig, type AppConfig } from './config'

/**
 * The app's one client: the service role, built from the key compiled into this bundle.
 *
 * There used to be two, and a login in front of them — an anon client carrying the
 * signed-in session for the post row, so RLS could record who uploaded it, and the
 * service role for storage and the counters. The board has no accounts now. Nothing on
 * the site ever showed who uploaded what, every account was the same person's, and this
 * bundle already carried the service-role key, so the password was a step in front of a
 * door that was never the one being locked.
 *
 * What replaces it is the schema: `posts`, `tags` and `post_tags` have a select policy
 * and no write policy at all, so the anon key the website holds can only read, and this
 * key — which never leaves the main process, and only exists in a build someone made
 * for their own board — is the only thing that can write. Possession of the installer is
 * the authorization now, and it always effectively was.
 */

let client: SupabaseClient | null = null
let builtFor: AppConfig | null = null

/** The service-role client, or null if this bundle was built without a project. */
export function boardClient(): SupabaseClient | null {
  const config = loadConfig()
  if (!config) return null

  // The config is compiled in and cannot change while the window is open, so this is
  // built once. The comparison stays because a client caches the URL and key it was
  // made with, and nothing here should quietly outlive the values behind it.
  if (!client || builtFor !== config) {
    exportConfigToEnv(config)
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    builtFor = config
  }

  return client
}
