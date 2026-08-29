import type { Rating } from '@web/lib/search'
import type { TagCategory } from '@web/lib/tags'
import type { UploadResult } from '@web/lib/upload/pipeline'

/**
 * The whole surface between the window and the process that does the work. The renderer
 * has no Node, no keys and no network: everything it can do is on this interface, and
 * everything on this interface is one `ipcMain.handle` in `main/ipc.ts`.
 *
 * Types only — imported by the preload bridge, by the renderer, and by the handlers, so
 * a channel that changes shape breaks all three at once instead of at runtime.
 */

export type AppConfigInput = {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  siteUrl: string
}

export type SignedInUser = {
  id: string
  username: string
  email: string | null
}

export type AppStatus = {
  /**
   * False until the project URL and both keys are known — the desktop equivalent of
   * `isSupabaseConfigured()` gating the web's `<SetupNotice />`.
   */
  configured: boolean
  user: SignedInUser | null
  /** Where a finished post can be opened, or '' if the board's address was never given. */
  siteUrl: string
  limits: { maxFileSize: number; maxFileSizeLabel: string; maxPixels: number }
  /** Whether the OS gave us a key to encrypt the stored credentials with. */
  encryptedAtRest: boolean
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
  | ({ ok: true } & StagedFile)
  | { ok: false; path: string; name: string; error: string }

export type TagSuggestion = { name: string; category: TagCategory; post_count: number }

export type UploadRequest = {
  path: string
  /** Space-separated, exactly as the tag field renders it — the pipeline parses it. */
  tags: string
  rating: Rating
  sourceUrl: string
}

export type Outcome = { ok: true } | { ok: false; error: string }

export type PostAppApi = {
  getStatus: () => Promise<AppStatus>
  saveConfig: (config: AppConfigInput) => Promise<Outcome>
  readConfig: () => Promise<AppConfigInput | null>
  logIn: (email: string, password: string) => Promise<Outcome>
  logOut: () => Promise<void>
  /** Opens the OS picker. Returns the paths chosen, empty if cancelled. */
  chooseFiles: () => Promise<string[]>
  stageFiles: (paths: string[]) => Promise<StageOutcome[]>
  /** Drag-and-drop hands the renderer a `File` with no path on it; this asks Electron for one. */
  pathForFile: (file: File) => string
  suggestTags: (query: string) => Promise<TagSuggestion[]>
  uploadPost: (request: UploadRequest) => Promise<UploadResult>
  openExternal: (url: string) => Promise<void>
  /** Reveals the stored settings file in the OS file manager. */
  openConfigFolder: () => Promise<void>
}

export type { UploadResult } from '@web/lib/upload/pipeline'
