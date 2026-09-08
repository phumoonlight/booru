import type { Rating } from '@common/search'
import type { Tag, TagCategory } from '@common/tags'
import type { Post, PostPage } from '@common/data/posts'
import type { UploadResult } from '@common/upload/pipeline'
import type { FormSectionEdit, FormSections } from '@common/data/form-sections'
import type { RuleKind, TagRules } from '@common/data/rules'
import type { TagCatalogs } from './catalogs'

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
 * A browser installed on this machine, as `main/browser.ts` found it. `path` is the
 * executable and the identity — it is what the preference stores and what gets launched.
 */
export type BrowserChoice = { path: string; name: string; isDefault: boolean }

/**
 * The only settings the window can change. Which board the app talks to is compiled into
 * the build (`main/config.ts`) — these are about the machine it happens to run on.
 */
export type PreferencesInput = {
  /** Cores the compressor may use. Clamped to what the machine has — `main/cpu.ts`. */
  encodeThreads: number
  /** How hard the app argues for those cores against everything else running. */
  encodePriority: EncodePriority
  /**
   * The executable a link opens in, or '' for whatever the OS would pick. Checked against
   * the installed list when a link is opened, never run as given — `main/browser.ts`.
   */
  browser: string
}

/** What an export or an import answers with — `main/transfer.ts`. */
export type TransferResult =
  | { ok: true; path: string; message: string }
  | { ok: false; error: string }
  | { ok: false; cancelled: true }

export type AppStatus = {
  /**
   * False only if this build was made without the project's values, which the build
   * itself refuses to do — the desktop equivalent of `isSupabaseConfigured()` gating the
   * web's `<SetupNotice />`, kept so a broken bundle explains itself instead of failing
   * inside a Supabase call.
   */
  configured: boolean
  /** Where a finished post can be opened. Compiled in, and shown on the settings screen. */
  siteUrl: string
  /** The project this build talks to. Shown on the settings screen; no key ever is. */
  supabaseUrl: string
  /**
   * What the About screen shows, and what a bug report needs: the app and the runtime
   * under it. `versions.app` is `app.getVersion()` — `packages/desktop/package.json`,
   * raised by every change there and stamped on the installer by electron-builder.
   */
  versions: { app: string; electron: string; chrome: string }
  /**
   * `!app.isPackaged` — a checkout run by `desktop:dev`, not an installed copy. About
   * says so beside the version, because the two look identical otherwise and they are not
   * the same thing: a dev run reads `save.json` from its own `userData`
   * (`pubooru-desktop-dev`), so its settings are somebody else's, and the version it
   * reports is whatever the working tree currently says rather than what was shipped.
   * Read in main, since the renderer has no `process` to ask.
   */
  development: boolean
  limits: { maxFileSize: number; maxFileSizeLabel: string; maxPixels: number }
  /** The cached tag index behind autocomplete: how many names, and when they were read. */
  tagCache: { count: number; at: number | null }
  /** What the machine has, and what the encoder is currently running with. */
  cpu: { count: number; threads: number; priority: EncodePriority }
  /** Where links go: the browsers found on this machine, and the one chosen. */
  browser: { chosen: string; options: BrowserChoice[] }
}

/**
 * The browse grid as it is kept on disk for a day (`main/browse-cache.ts`). The query
 * travels with the rows because it is what they answer: a grid drawn under a query that
 * did not produce it is the one way this cache could lie.
 */
export type BrowseCacheFile = { at: number; query: string; posts: Post[]; hasMore: boolean }

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
  /**
   * The md5 of the bytes, which is what the post would be named — so it is also the
   * question "is this already up?", asked at staging rather than at upload.
   */
  md5: string
}

export type StageOutcome =
  | ({ ok: true } & StagedFile & {
        /** The post already holding these bytes, or null — including when the board could
         *  not be reached, since that is not the same as knowing it is new. */
        duplicateOf: number | null
      })
  | { ok: false; path: string; name: string; error: string }

export type TagSuggestion = { name: string; category: TagCategory; post_count: number }

export type UploadRequest = {
  path: string
  /** Space-separated, exactly as the tag field renders it — the pipeline parses it. */
  tags: string
  rating: Rating
  sourceUrl: string
}

/**
 * What the upload screen is holding, pushed to main whenever it changes. Closing the
 * window is the only thing that reads it — `main/close-guard.ts` has why it is pushed
 * rather than asked for.
 *
 * Booleans rather than counts, since the screen stages one image at a time: what main has
 * to decide is whether there is anything to lose, and "an image with tags typed into it"
 * and "the number of the post just made" are the two things that are.
 */
export type StagedState = {
  /** An image staged and not uploaded — tags typed by hand and held nowhere else. */
  staged: boolean
  /** A finished upload still on screen, with the post number it made. */
  uploaded: boolean
  /** Whether an upload is in flight right now. */
  busy: boolean
}

export type Outcome = { ok: true } | { ok: false; error: string }

/** A post the editor has open: the row, and its tags as the field wants them. */
export type LoadedPost = { post: Post; tags: Tag[] }

/** What `tags:apply` answers with — the counts are the point, not the ok. */
export type ApplyTagOutcome =
  | { ok: true; target: string; condition: string; added: number; already: number }
  | { ok: false; error: string }

/** A rename and a create both answer with the name as it was actually stored. */
export type NamedOutcome = { ok: true; name: string } | { ok: false; error: string }

export type PostAppApi = {
  getStatus: () => Promise<AppStatus>
  /** Writes and applies the compression preferences, answering with what was stored. */
  savePreferences: (preferences: PreferencesInput) => Promise<PreferencesInput>
  /** `remember` writes the credentials to the save file; false wipes what was there. */
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
  /** The browse grid from the last session, if it is less than a day old — `main/browse-cache.ts`. */
  readBrowseCache: () => Promise<BrowseCacheFile | null>
  /** Hands the rows on screen to disk, stamped with the moment they are written. */
  writeBrowseCache: (cache: { query: string; posts: Post[]; hasMore: boolean }) => Promise<void>
  /** Drops the stored grid, so the next launch reads the board instead of drawing this. */
  clearBrowseCache: () => Promise<void>
  /**
   * The board's tag rules of one kind — `'implies'` is applied by itself
   * (`shared/implications.ts`), `'recommends'` is only offered
   * (`shared/recommendations.ts`). One pair of channels rather than two, because the two
   * sets differ in what the window does with them and not in their shape.
   */
  listRules: (kind: RuleKind) => Promise<TagRules>
  /**
   * Writes one tag's whole rule — the panel that edits a rule has exactly one tag open —
   * and answers with the set as it now stands after normalising. An empty list deletes
   * the rule.
   */
  saveRule: (kind: RuleKind, tag: string, names: string[]) => Promise<TagRules>
  /**
   * The rows the tag form draws under a category, and their order — `tag_form_section` on
   * the board. One write taking one edit: a section has an id, so creating, renaming,
   * deleting and moving are four things done to a row rather than four ways of restating a
   * list. `error` is a refusal the typist can fix — a name already taken, an empty one.
   */
  listFormSections: () => Promise<FormSections>
  saveFormSections: (edit: FormSectionEdit) => Promise<{ sections: FormSections; error?: string }>
  /** The named sets of tags this machine keeps — `shared/catalogs.ts` has what they are. */
  listCatalogs: () => Promise<TagCatalogs>
  saveCatalogs: (catalogs: TagCatalogs) => Promise<TagCatalogs>
  uploadPost: (request: UploadRequest) => Promise<UploadResult>
  /**
   * Browse the board. The same query grammar the website's search bar uses — one
   * implementation, in `@common/data/search` — so a query means the same thing in both
   * windows. `after` is the feed's cursor: strictly older than that post, and `perPage`
   * is the grid's own screenful — omitted, the read falls back to the website's page
   * size, which is a page's decision and not this window's.
   */
  searchPosts: (options: { query?: string; after?: number; perPage?: number }) =>
    Promise<PostPage>
  /** One post and its tags, for the editor. */
  getPost: (id: number) => Promise<LoadedPost | null>
  /** Rewrites a post's rating, source and whole tag set. */
  savePost: (request: {
    id: number
    tags: string
    rating: Rating
    sourceUrl: string
  }) => Promise<Outcome>
  /** Removes the post row and both of its stored images. */
  deletePost: (id: number) => Promise<Outcome>
  /**
   * A post's thumbnail as a `data:` URL. Fetched by main because the window's CSP allows
   * `self` and `data:` and nothing else, which is a rule worth an IPC hop to keep.
   */
  postThumbnail: (fileName: string) => Promise<string>
  /** `sectionId` is a row of `tag_form_section`, or null for none. */
  createTag: (
    name: string,
    category: TagCategory,
    sectionId: number | null
  ) => Promise<NamedOutcome>
  renameTag: (id: number, name: string) => Promise<NamedOutcome>
  setTagCategory: (id: number, category: TagCategory) => Promise<Outcome>
  /** Which row of the tag form the tag is offered on, or null for none. A rename of that
   *  row carries the tag with it, which is why this is an id. */
  setTagFormSection: (id: number, sectionId: number | null) => Promise<Outcome>
  /** Sets the glyphs drawn in front of the tag's name, or clears them with ''. */
  setTagMark: (id: number, mark: string) => Promise<Outcome>
  deleteTag: (id: number) => Promise<Outcome>
  /** Adds one tag to every post already carrying another. */
  applyTagToTagged: (target: string, condition: string) => Promise<ApplyTagOutcome>
  /** Tells main what the upload screen holds, so closing can ask before dropping it. */
  reportStaged: (state: StagedState) => void
  openExternal: (url: string) => Promise<void>
  /**
   * `save.json` out to a file, and back in from one. Each opens its own picker on the
   * main side, so neither takes a path — the renderer has no filesystem to name one with.
   * `cancelled` is the dismissed picker, which is not a failure and is not reported as one.
   */
  exportSettings: () => Promise<TransferResult>
  importSettings: () => Promise<TransferResult>
  /** Reveals `save.json` — preferences and tag rules — in the OS file manager. */
  openDataFolder: () => Promise<void>
}

export type { UploadResult } from '@common/upload/pipeline'
