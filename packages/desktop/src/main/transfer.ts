import { copyFileSync, readFileSync } from 'node:fs'
import { app, dialog } from 'electron'
import type { TransferResult } from '../shared/api'
import { normalizeRules } from '../shared/implications'
import { normalizeRecommendations } from '../shared/recommendations'
import { loadPreferences, savePreferences } from './preferences'
import { savePath, writeSection } from './save-file'

/**
 * `save.json` out to a file you choose, and back in from one.
 *
 * The file has always been plain readable JSON that can be copied by hand — that was the
 * whole point of dropping the encryption. What it did not have was a way to *find* it: the
 * data folder is a path nobody would guess, and "open the folder, copy the file, put it on
 * the other machine, find the folder there" is four steps to move settings between a
 * desktop and a laptop, or to keep a copy of a few hundred tag rules before trying
 * something.
 *
 * Two buttons on the settings screen instead. Nothing in the file is secret — the
 * service-role key is compiled into the bundle, not stored — so an export is safe to put
 * anywhere, and that is worth saying out loud since a file called "settings" from an app
 * that writes to a database sounds like it should not be.
 */

/** What a picker suggests, so a folder of these is sortable and self-describing. */
function suggestedName(): string {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  return `pubooru-settings-${stamp}.json`
}

/**
 * Writes the save file where you point it.
 *
 * A byte-for-byte copy rather than a re-serialization of what the app currently holds in
 * memory: an export is meant to be the file, including any section this version does not
 * know about and any hand-edit made since launch. Nothing is filtered on the way out
 * because there is nothing in there to filter.
 *
 * An app that has saved nothing yet has no file at all, which is worth saying rather than
 * writing an empty one — an export of nothing is a backup that silently restores nothing.
 */
export async function exportSave(): Promise<TransferResult> {
  const source = savePath()

  const chosen = await dialog.showSaveDialog({
    title: 'Export settings',
    defaultPath: `${app.getPath('documents')}/${suggestedName()}`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (chosen.canceled || !chosen.filePath) return { ok: false, cancelled: true }

  try {
    // Read first: a missing save file is the one failure worth its own sentence, and
    // `copyFileSync` would report it as a path error about a file you never named.
    const contents = readFileSync(source, 'utf8')
    if (contents.trim() === '') throw new Error('The settings file is empty.')
    copyFileSync(source, chosen.filePath)
    return { ok: true, path: chosen.filePath, message: 'Settings exported.' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: reason.includes('ENOENT')
        ? 'Nothing to export yet — no setting or tag rule has been saved on this machine.'
        : `Could not export: ${reason}`,
    }
  }
}

/**
 * Reads a file you point at and takes what it recognises.
 *
 * **Section by section, and validated, rather than dropped over the top.** A copy of the
 * file is the obvious implementation and the wrong one: it would carry across whatever
 * happened to be in the exporting version — a section this build has retired, a rule
 * naming a tag that does not match `TAG_PATTERN` — and the first thing to read it would
 * fail somewhere far from here. Every section goes through the same `normalize…` the IPC
 * channels use, so an import can only produce a file this app could have written itself.
 *
 * Preferences go through `savePreferences`, which clamps them and **applies them as it
 * writes** — the thread count and the priority take effect on the next encode rather than
 * the next launch, which is what that function exists for and what makes an import feel
 * like a settings change instead of a restart.
 *
 * Sections the file does not have are left alone rather than cleared. Importing a file
 * that is only tag rules is a reasonable thing to do, and it should not silently reset the
 * compression settings on the way past.
 */
export async function importSave(): Promise<TransferResult> {
  const chosen = await dialog.showOpenDialog({
    title: 'Import settings',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  const file = chosen.filePaths[0]
  if (chosen.canceled || !file) return { ok: false, cancelled: true }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return {
      ok: false,
      error: `That file is not readable JSON: ${error instanceof Error ? error.message : error}`,
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'That file is JSON, but not a settings file.' }
  }

  const document = parsed as Record<string, unknown>
  const took: string[] = []

  if ('implications' in document) {
    const rules = normalizeRules(document.implications)
    writeSection('implications', rules)
    took.push(count(Object.keys(rules).length, 'implication'))
  }
  if ('recommendations' in document) {
    const rules = normalizeRecommendations(document.recommendations)
    writeSection('recommendations', rules)
    took.push(count(Object.keys(rules).length, 'recommendation'))
  }
  const preferences = document.preferences
  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
    // Merged onto what is already stored rather than replacing it, so a file written by a
    // version with fewer preferences does not blank the ones it never knew about.
    savePreferences({ ...loadPreferences(), ...preferences })
    took.push('preferences')
  }

  if (took.length === 0) {
    return { ok: false, error: 'Nothing in that file to import — no preferences, no tag rules.' }
  }
  return { ok: true, path: file, message: `Imported ${took.join(', ')}.` }
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
