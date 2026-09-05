import { readSection, writeSection } from './save-file'
import {
  applyEncodePriority,
  applyEncodeThreads,
  clampEncodePriority,
  clampEncodeThreads,
} from './cpu'
import type { EncodePriority } from '../shared/api'

/**
 * What the app remembers about *this machine*, as opposed to the board — which is
 * compiled in (`main/config.ts`) and cannot be changed from the window.
 *
 * Two of the three are about the same thing: how much of the CPU an upload is allowed to
 * take, and how hard it argues for it. `main/cpu.ts` holds what they do and the
 * measurements behind their defaults. The third is where a link out of the app goes.
 */
export type Preferences = {
  encodeThreads: number
  encodePriority: EncodePriority
  browser: string
}

/**
 * Normalised on the way out, so a save file from before these existed — or one
 * hand-edited to 400 threads — still answers with values the encoder can use.
 */
export function loadPreferences(): Preferences {
  const stored = readSection<Partial<Preferences>>('preferences')
  return {
    encodeThreads: clampEncodeThreads(stored?.encodeThreads),
    encodePriority: clampEncodePriority(stored?.encodePriority),
    browser: clampBrowser(stored?.browser),
  }
}

/**
 * Nothing here checks that the path is a browser, or that it exists: `openUrl` resolves
 * it against what is actually installed on every click, so a stale value costs the OS
 * default and never a failed launch.
 */
function clampBrowser(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : ''
}

/**
 * Writes and applies in one step, because a preference that needs a restart to take
 * effect is one the settings screen would have to explain. Both are process-wide
 * settings that can be re-applied — with the single exception `applyEncodePriority`
 * documents, where a POSIX host will not let a niced-down process climb back up. The
 * browser needs no applying: it is read at the moment a link is opened.
 */
export function savePreferences(input: Partial<Preferences>): Preferences {
  const next: Preferences = {
    encodeThreads: clampEncodeThreads(input.encodeThreads),
    encodePriority: clampEncodePriority(input.encodePriority),
    browser: clampBrowser(input.browser),
  }
  writeSection('preferences', next)
  applyPreferences(next)
  return next
}

/** Called at startup too, before anything can be encoded. */
export function applyPreferences(preferences: Preferences): void {
  applyEncodeThreads(preferences.encodeThreads)
  applyEncodePriority(preferences.encodePriority)
}
