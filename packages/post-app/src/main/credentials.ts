import { clearSection, readSection, writeSection } from './save-file'

/**
 * The login screen's "Remember me": the email and password typed into it, kept so the
 * form comes back filled in rather than blank.
 *
 * Storing a password at rest is a real cost, and since the save file stopped being
 * encrypted it is a plain-text one: ticking the box now means "write my password to a
 * readable file". It lands beside the service-role key, which bypasses RLS for the whole
 * project, so it is the smaller of the two secrets in there — but neither is protected
 * by anything except the folder they sit in.
 *
 * Nothing reads it but the login form, and unchecking the box on the next login wipes
 * it — see `saveCredentials`.
 */

export type SavedCredentials = {
  email: string
  password: string
}

export function readCredentials(): SavedCredentials | null {
  const saved = readSection<SavedCredentials>('credentials')
  if (!saved || typeof saved.email !== 'string' || typeof saved.password !== 'string') return null
  return saved
}

/** Writes on a remembered login, and clears on one that wasn't — the box is the switch. */
export function saveCredentials(credentials: SavedCredentials | null): void {
  if (credentials) writeSection('credentials', credentials)
  else clearSection('credentials')
}
