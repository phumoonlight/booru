import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * Small JSON files in the app's userData directory, encrypted at rest where the OS
 * offers it — DPAPI on Windows, Keychain on macOS, libsecret on Linux.
 *
 * Three things live in here and all are credentials: the Supabase keys the app was set
 * up with (`config.store`), the signed-in session (`session.store`) and, if the login
 * screen was told to remember them, an email and password (`credentials.store`). The
 * service-role key in particular bypasses RLS entirely, so leaving it as plain text in a
 * world-readable file would be worse than what the web does with it — there it is an
 * environment variable on a server nobody has a shell on.
 *
 * `safeStorage` is not available on every Linux desktop, so the format carries a marker
 * saying which it is. A file written on one is readable on the other only in the plain
 * direction; a sealed file that can no longer be opened is treated as absent, which
 * costs a re-login or a re-setup and never a crash.
 *
 * The extension is `.store` because these are not JSON documents: a marker and a base64
 * blob, which no editor opening a `.json` file can do anything with. They were named
 * `.json` first, so the old name is still read once and moved forward — see `legacyPath`.
 */

const SEALED = 'sealed:'
const PLAIN = 'plain:'

/** Where a store file lives. Exported so the settings screen can point at it. */
export function storePath(name: string): string {
  return join(app.getPath('userData'), name)
}

/**
 * Where a store used to live, before the `.json` name started claiming to be something
 * openable. An install that predates the rename keeps its keys and its session rather
 * than being asked for both again: the old file is read once, rewritten under the new
 * name and deleted. Nothing writes one, so this can go once no such install is left.
 */
function legacyPath(name: string): string | null {
  return name.endsWith('.store') ? storePath(name.replace(/\.store$/, '.json')) : null
}

export function readStore<T>(name: string): T | null {
  const file = storePath(name)
  const legacy = legacyPath(name)
  const source = existsSync(file) ? file : legacy && existsSync(legacy) ? legacy : null
  if (!source) return null

  try {
    const raw = readFileSync(source, 'utf8')
    let json: string
    if (raw.startsWith(SEALED)) {
      json = safeStorage.decryptString(Buffer.from(raw.slice(SEALED.length), 'base64'))
    } else if (raw.startsWith(PLAIN)) {
      json = raw.slice(PLAIN.length)
    } else {
      return null
    }
    const value = JSON.parse(json) as T
    // Only a file that decoded is worth carrying over — a sealed one this machine can no
    // longer open falls through to the catch and is left where it is, as absent as ever.
    if (source === legacy) {
      writeStore(name, value)
      rmSync(legacy, { force: true })
    }
    return value
  } catch (error) {
    console.error(`Could not read ${name}:`, error instanceof Error ? error.message : error)
    return null
  }
}

export function writeStore(name: string, value: unknown): void {
  const file = storePath(name)
  mkdirSync(dirname(file), { recursive: true })

  const json = JSON.stringify(value)
  const raw = safeStorage.isEncryptionAvailable()
    ? SEALED + safeStorage.encryptString(json).toString('base64')
    : PLAIN + json
  writeFileSync(file, raw, { encoding: 'utf8', mode: 0o600 })
}

export function clearStore(name: string): void {
  rmSync(storePath(name), { force: true })
  // The old name too, or a logout would leave a session behind for the next read to
  // migrate back in.
  const legacy = legacyPath(name)
  if (legacy) rmSync(legacy, { force: true })
}
