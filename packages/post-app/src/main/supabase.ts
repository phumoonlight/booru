import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { clearStore, readStore, writeStore } from './secure-store'
import { exportConfigToEnv, loadConfig, type AppConfig } from './config'

/**
 * The app's two clients, the same split the web runs on.
 *
 * `userClient()` holds the signed-in session and is what writes the post row, so RLS
 * records the real uploader. `adminClient()` is the service role, for the storage
 * writes and the counter recounts — nothing a user session may do.
 *
 * There is no third client and no anonymous one: this app only ever acts as a
 * signed-in user, and every read it makes (tag autocomplete, the md5 dedupe check) is
 * one a signed-in user is allowed.
 */

const SESSION_FILE = 'session.store'

/**
 * Supabase persists the session by writing to a `Storage`. A browser hands it
 * `localStorage`; here it gets the encrypted file store, mirrored in memory so the
 * synchronous reads the auth client makes on startup never touch the disk twice.
 */
function sessionStorage(): SupportedStorage {
  let entries = readStore<Record<string, string>>(SESSION_FILE) ?? {}

  return {
    getItem: (key) => entries[key] ?? null,
    setItem: (key, value) => {
      entries = { ...entries, [key]: value }
      writeStore(SESSION_FILE, entries)
    },
    removeItem: (key) => {
      const next = { ...entries }
      delete next[key]
      entries = next
      if (Object.keys(entries).length === 0) clearStore(SESSION_FILE)
      else writeStore(SESSION_FILE, entries)
    },
  }
}

let user: SupabaseClient | null = null
let admin: SupabaseClient | null = null
let builtFor: AppConfig | null = null

function clients(): { user: SupabaseClient; admin: SupabaseClient } | null {
  const config = loadConfig()
  if (!config) return null

  // Settings can be re-saved while the window is open, and a client caches the URL and
  // key it was built with, so both are rebuilt whenever the config it was built from is
  // no longer the current one.
  if (!user || !admin || builtFor !== config) {
    exportConfigToEnv(config)
    user = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // No redirect ever lands here — this is a desktop window, not a browser tab.
        detectSessionInUrl: false,
        storage: sessionStorage(),
      },
    })
    admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    builtFor = config
  }

  return { user, admin }
}

export function userClient(): SupabaseClient | null {
  return clients()?.user ?? null
}

export function adminClient(): SupabaseClient | null {
  return clients()?.admin ?? null
}

export type SignedInUser = {
  id: string
  username: string
  email: string | null
}

/**
 * The signed-in profile, or null. Same two calls `getCurrentProfile()` makes on the web:
 * the session says who, `profiles` says what they are called.
 */
export async function currentUser(): Promise<SignedInUser | null> {
  const supabase = userClient()
  if (!supabase) return null

  const {
    data: { user: account },
  } = await supabase.auth.getUser()
  if (!account) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', account.id)
    .maybeSingle()

  return {
    id: account.id,
    username: profile?.username ?? account.email ?? account.id,
    email: account.email ?? null,
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = userClient()
  if (!supabase) return { ok: false, error: 'Not set up yet' }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  // Deliberately the same message the web gives for either half being wrong
  if (error) return { ok: false, error: 'Invalid email or password' }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  await userClient()?.auth.signOut()
  clearStore(SESSION_FILE)
}

/** Forces the next `clients()` call to rebuild — the settings screen just changed them. */
export function resetClients(): void {
  user = null
  admin = null
  builtFor = null
}
