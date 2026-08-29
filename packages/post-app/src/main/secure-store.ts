import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * Small JSON files in the app's userData directory, encrypted at rest where the OS
 * offers it — DPAPI on Windows, Keychain on macOS, libsecret on Linux.
 *
 * Two things live in here and both are credentials: the Supabase keys the app was set
 * up with (`config.json`) and the signed-in session (`session.json`). The service-role
 * key in particular bypasses RLS entirely, so leaving it as plain text in a
 * world-readable file would be worse than what the web does with it — there it is an
 * environment variable on a server nobody has a shell on.
 *
 * `safeStorage` is not available on every Linux desktop, so the format carries a marker
 * saying which it is. A file written on one is readable on the other only in the plain
 * direction; a sealed file that can no longer be opened is treated as absent, which
 * costs a re-login or a re-setup and never a crash.
 */

const SEALED = 'sealed:'
const PLAIN = 'plain:'

function pathFor(name: string): string {
  return join(app.getPath('userData'), name)
}

export function readStore<T>(name: string): T | null {
  const file = pathFor(name)
  if (!existsSync(file)) return null

  try {
    const raw = readFileSync(file, 'utf8')
    let json: string
    if (raw.startsWith(SEALED)) {
      json = safeStorage.decryptString(Buffer.from(raw.slice(SEALED.length), 'base64'))
    } else if (raw.startsWith(PLAIN)) {
      json = raw.slice(PLAIN.length)
    } else {
      return null
    }
    return JSON.parse(json) as T
  } catch (error) {
    console.error(`Could not read ${name}:`, error instanceof Error ? error.message : error)
    return null
  }
}

export function writeStore(name: string, value: unknown): void {
  const file = pathFor(name)
  mkdirSync(dirname(file), { recursive: true })

  const json = JSON.stringify(value)
  const raw = safeStorage.isEncryptionAvailable()
    ? SEALED + safeStorage.encryptString(json).toString('base64')
    : PLAIN + json
  writeFileSync(file, raw, { encoding: 'utf8', mode: 0o600 })
}

export function clearStore(name: string): void {
  rmSync(pathFor(name), { force: true })
}
