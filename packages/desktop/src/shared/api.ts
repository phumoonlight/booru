import type { Rating } from '@common/search'
import type { Tag, TagCategory } from '@common/tags'
import type { UploadResult } from '@common/upload/pipeline'
import type { ImplicationRules } from './implications'
import type { RecommendationRules } from './recommendations'

/**
 * The whole surface between the window and the process that does the work. The renderer
 * has no Node, no keys and no network: everything it can do is on this interface, and
 * everything on this interface is one `ipcMain.handle` in `main/ipc.ts`.
 *
 * Types only — imported by the preload bridge, by the renderer, and by the handlers, so
 * a channel that changes shape breaks all three at once instead of at runtime.
 */

/**
 * Scheduling priority for the process that encodes. Declared here rather than in
 * `main/cpu.ts`, where it is used, because the settings screen offers the choice and the
 * renderer cannot import a module that pulls in sharp.
 */
export type EncodePriority = 'low' | 'below-normal' | 'normal'

/**
 * The only settings the window can change. Which board the app talks to is compiled into
 * the build (`main/config.ts`) — these two are about the machine it happens to run on.
 */
export type PreferencesInput = {
  /** Cores the compressor may use. Clamped to what the machine has — `main/cpu.ts`. */
  encodeThreads: number
  /** How hard the app argues for those cores against everything else running. */
  encodePriority: EncodePriority
}

export type SignedInUser = {
  id: string
  username: string
  email: string | null
}

export type AppStatus = {
  /**
   * False only if this build was made without the project's values, which the build
   * itself refuses to do — the desktop equivalent of `isSupabaseConfigured()` gating the
   * web's `<SetupNotice />`, kept so a broken bundle explains itself instead of failing
   * inside a Supabase call.
   */
  configured: boolean
  user: SignedInUser | null
  /** Where a finished post can be opened. Compiled in, and shown on the settings screen. */
  siteUrl: string
  /** The project this build talks to. Shown on the settings screen; no key ever is. */
  supabaseUrl: string
  /** What the About screen shows, and what a bug report needs: the app and the runtime under it. */
  versions: { app: string; electron: string; chrome: string }
  limits: { maxFileSize: number; maxFileSizeLabel: string; maxPixels: number }
  /** The cached tag index behind autocomplete: how many names, and when they were read. */
  tagCache: { count: number; at: number | null }
  /** What the machine has, and what the encoder is currently running with. */
  cpu: { count: number; threads: number; priority: EncodePriority }
}

/**
 * A file the main process has looked at: within the limits, decodable, and already
 * carrying the small preview the queue paints. `main/staging.ts` produces these.
 */
export type StagedFile = {
  path: string
  name: string
  size: number
  width: number
  height: number
  /** A `data:` URL small enough to hand straight to an `<img>`, or '' if the preview failed. */
  preview: string
}

export type StageOutcome =
  ({ ok: true } & StagedFile) | { ok: false; path: string; name: string; error: string }

export type TagSuggestion = { name: string; category: TagCategory; post_count: number }

export type UploadRequest = {
  path: string
  /** Space-separated, exactly as the tag field renders it — the pipeline parses it. */
  tags: string
  rating: Rating
  sourceUrl: string
}

/**
 * What the window has staged, pushed to main whenever it changes. Closing the window is
 * the only thing that reads it — `main/queue-guard.ts` has why it is pushed rather than
 * asked for.
 */
export type QueueState = {
  /** Rows not uploaded yet: the ones carrying tags typed by hand and nothing else. */
  pending: number
  /** Rows that finished, still listed with their post numbers. */
  uploaded: number
  /** Whether a run is in flight right now. */
  busy: boolean
}

export type Outcome = { ok: true } | { ok: false; error: string }

/** What "Remember me" kept from the last login, for the form to come back filled in. */
export type SavedLogin = { email: string; password: string }

export type PostAppApi = {
  getStatus: () => Promise<AppStatus>
  /** Writes and applies the compression preferences, answering with what was stored. */
  savePreferences: (preferences: PreferencesInput) => Promise<PreferencesInput>
  /** `remember` writes the credentials to the save file; false wipes what was there. */
  logIn: (email: string, password: string, remember: boolean) => Promise<Outcome>
  /** The remembered credentials, or null — the login form prefills itself from this. */
  readSavedLogin: () => Promise<SavedLogin | null>
  logOut: () => Promise<void>
  /** Opens the OS picker. Returns the paths chosen, empty if cancelled. */
  chooseFiles: () => Promise<string[]>
  stageFiles: (paths: string[]) => Promise<StageOutcome[]>
  /** Downloads images dragged in from a browser, then stages them like picked files. */
  fetchImages: (urls: string[]) => Promise<StageOutcome[]>
  /**
   * A screen-sized version of one staged file, for the viewer a clicked row opens. Made
   * on request rather than kept in `StagedFile`, and '' if it couldn't be drawn.
   */
  previewFile: (path: string) => Promise<string>
  /** Drag-and-drop hands the renderer a `File` with no path on it; this asks Electron for one. */
  pathForFile: (file: File) => string
  /** The board's tag index, most used first — what the Tags screen paints. */
  listTags: () => Promise<Tag[]>
  suggestTags: (query: string) => Promise<TagSuggestion[]>
  /** Throws away the cached tag index; the next lookup reads the board again. */
  clearTagCache: () => Promise<void>
  /** This machine's tag implication rules — `shared/implications.ts` has what they are. */
  listImplications: () => Promise<ImplicationRules>
  /** Writes the whole rule set, answering with what was stored after normalising. */
  saveImplications: (rules: ImplicationRules) => Promise<ImplicationRules>
  /** The rules that are offered rather than applied — `shared/recommendations.ts`. */
  listRecommendations: () => Promise<RecommendationRules>
  saveRecommendations: (rules: RecommendationRules) => Promise<RecommendationRules>
  uploadPost: (request: UploadRequest) => Promise<UploadResult>
  /** Tells main what the queue holds, so closing the window can ask before dropping it. */
  reportQueue: (state: QueueState) => void
  openExternal: (url: string) => Promise<void>
  /** Reveals `save.json` — session and preferences — in the OS file manager. */
  openDataFolder: () => Promise<void>
}

export type { UploadResult } from '@common/upload/pipeline'
