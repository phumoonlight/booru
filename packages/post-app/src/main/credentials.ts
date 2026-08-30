import { clearStore, readStore, writeStore } from './secure-store'

/**
 * The login screen's "Remember me": the email and password typed into it, kept so the
 * form comes back filled in rather than blank.
 *
 * Storing a password at rest is a real cost, and it is taken deliberately. The session
 * already survives a restart, so this screen only reappears once the refresh token has
 * finally expired — at which point the alternative is retyping the password into a
 * desktop app that is already holding the service-role key in the file next to this
 * one. That key bypasses RLS for the whole project; one account's password is the
 * smaller of the two secrets, sealed by the same `safeStorage`.
 *
 * Nothing reads it but the login form, and unchecking the box on the next login wipes
 * it — see `saveCredentials`.
 */

const CREDENTIALS_FILE = 'credentials.store'

export type SavedCredentials = {
  email: string
  password: string
}

export function readCredentials(): SavedCredentials | null {
  const saved = readStore<SavedCredentials>(CREDENTIALS_FILE)
  if (!saved || typeof saved.email !== 'string' || typeof saved.password !== 'string') return null
  return saved
}

/** Writes on a remembered login, and clears on one that wasn't — the box is the switch. */
export function saveCredentials(credentials: SavedCredentials | null): void {
  if (credentials) writeStore(CREDENTIALS_FILE, credentials)
  else clearStore(CREDENTIALS_FILE)
}
