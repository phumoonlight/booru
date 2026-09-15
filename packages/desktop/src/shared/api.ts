import type { Rating } from '@common/search'
import type { Tag, TagCategory } from '@common/tags'
import type { UploadResult } from '@common/upload/pipeline'
import type { FormSectionEdit, FormSections } from '@common/data/form-sections'
import type { RuleKind, TagRules } from '@common/data/rules'
import type { Collection, CollectionPostPage } from '@common/data/collections'
import type { CollectionInput } from '@common/data/collections-write'
import type { Artist, ArtistUrl } from '@common/data/artists'
import type { ArtistImageResult } from '@common/upload/artist'
import type { SiteState } from '@common/data/site'

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
   * False only if this build was made without the board's values, which the build itself
   * refuses to do — the desktop equivalent of `isDatabaseConfigured()` gating the web's
   * `<SetupNotice />`, kept so a broken bundle explains itself instead of failing inside
   * a connection attempt.
   */
  configured: boolean
  /** The website, where a shelf or an image can be opened. Compiled in, and shown on the
   *  settings screen. */
  siteUrl: string
  /**
   * The database's **host**, not its URL. The settings screen answers "which board is
   * this" and must never answer "with what password", and a Postgres connection string
   * carries one — where the Supabase project URL this replaced carried nothing.
   */
  databaseHost: string
  /** Where images are served from. Public by definition — it is in the site's markup. */
  cdnUrl: string
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
 * What a batch of files is being staged *for*, which is the only thing the duplicate check
 * needs to know. A collection asks "is this already on any shelf", because
 * `collection_posts.file_name` is unique across the whole table; an artist's example images
 * are the same shape again — unique across every artist, so the answer names whose they are.
 */
export type StageTarget = 'collection' | 'artist'

/**
 * A file the main process has looked at: within the limits, decodable, and already
 * carrying the small preview the staging batch paints. `main/staging.ts` produces these.
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
   * The md5 of the bytes, which is what the image would be named — so it is also the
   * question "is this already up?", asked at staging rather than at upload.
   */
  md5: string
}

export type StageOutcome =
  | ({ ok: true } & StagedFile & {
        /** The row already holding these bytes, or null — including when the board could
         *  not be reached, since that is not the same as knowing it is new. */
        duplicateOf: number | null
        /** For a collection target, the shelf that image is on; for an artist target, the
         *  artist. Null when there is no duplicate. */
        duplicateIn: string | null
      })
  | { ok: false; path: string; name: string; error: string }

export type Outcome = { ok: true } | { ok: false; error: string }

/** A rename and a create both answer with the name as it was actually stored. */
export type NamedOutcome = { ok: true; name: string } | { ok: false; error: string }

/** The same, plus the id — a new shelf is opened straight after it is named, so the
 *  screen would otherwise have to re-read the list to find out what it just made. */
export type CollectionNamed = { ok: true; id: number; name: string } | { ok: false; error: string }

/** A shelf's edit, answering with what was stored — the mark is trimmed or cleared there. */
export type CollectionEdited =
  | { ok: true; name: string; mark: string | null; rating: Rating; is_ai: boolean }
  | { ok: false; error: string }

export type PostAppApi = {
  getStatus: () => Promise<AppStatus>
  /** Writes and applies the compression preferences, answering with what was stored. */
  savePreferences: (preferences: PreferencesInput) => Promise<PreferencesInput>
  /** Opens the OS picker. Returns the paths chosen, empty if cancelled. */
  chooseFiles: () => Promise<string[]>
  /** `target` because staging asks "is this already up?", and where that is asked decides
   *  the answer — see `StageTarget`. */
  stageFiles: (paths: string[], target: StageTarget) => Promise<StageOutcome[]>
  /** Downloads images dragged in from a browser, then stages them like picked files. */
  fetchImages: (urls: string[], target: StageTarget) => Promise<StageOutcome[]>
  /** Drag-and-drop hands the renderer a `File` with no path on it; this asks Electron for one. */
  pathForFile: (file: File) => string
  /** The board's tag index, A–Z — what the Tags screen paints. */
  listTags: () => Promise<Tag[]>
  /** Throws away the cached tag index; the next lookup reads the board again. */
  clearTagCache: () => Promise<void>
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
   * The rows the tag form draws, and their order — `tag_form_sections` on the board. One
   * write taking one edit: a section has an id, so creating, renaming,
   * deleting and moving are four things done to a row rather than four ways of restating a
   * list. `error` is a refusal the typist can fix — a name already taken, an empty one.
   */
  listFormSections: () => Promise<FormSections>
  saveFormSections: (edit: FormSectionEdit) => Promise<{ sections: FormSections; error?: string }>
  /** `sectionId` is a row of `tag_form_sections`, or null for none. */
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
  openExternal: (url: string) => Promise<void>
  /**
   * `save.json` out to a file, and back in from one. Each opens its own picker on the
   * main side, so neither takes a path — the renderer has no filesystem to name one with.
   * `cancelled` is the dismissed picker, which is not a failure and is not reported as one.
   */
  /**
   * The website's maintenance switch — `site_settings` on the board. `null` is a board
   * that could not be asked, which the settings screen must draw as its own state: `false`
   * means visitors are being served the site, and a copy of the app that cannot reach
   * the database has no business claiming either.
   */
  getSiteState: () => Promise<SiteState | null>
  /** Moves the switch and re-words the notice in one write, answering with what stored. */
  saveSiteState: (input: {
    maintenance: boolean
    message: string
  }) => Promise<{ ok: true; state: SiteState } | { ok: false; error: string }>
  // ── Collections ──────────────────────────────────────────────────────────────
  // The shelves, which are the whole of what the website shows. No tags on them.

  /** Every shelf, most recently touched first — including empty ones, unlike the website. */
  listCollections: () => Promise<Collection[]>
  /** Names a new shelf. A duplicate name is the one failure worth wording. */
  createCollection: (input: CollectionInput) => Promise<CollectionNamed>
  /** Its name, mark, rating and AI flag, answering with each as stored. */
  editCollection: (id: number, input: CollectionInput) => Promise<CollectionEdited>
  /** Refused while the shelf still holds anything — the whole rule of the feature. */
  deleteCollection: (id: number) => Promise<Outcome>
  /** One shelf's images, newest first. `after` is the cursor; there is no query. */
  listCollectionPosts: (options: {
    collectionId: number
    after?: number
    perPage?: number
  }) => Promise<CollectionPostPage>
  /** One image onto one shelf. No rating: an image's tier is its shelf's. */
  uploadToCollection: (request: {
    collectionId: number
    path: string
    sourceUrl: string
  }) => Promise<UploadResult>
  /** A collection image's source — the whole of what there is to edit on one image. */
  saveCollectionPost: (request: { id: number; sourceUrl: string }) => Promise<Outcome>
  /** The manage selection onto another shelf, answering with how many moved — an image
   *  already there is skipped. */
  moveCollectionPosts: (
    ids: number[],
    collectionId: number
  ) => Promise<{ ok: true; moved: number } | { ok: false; error: string }>
  /** Removes the row and both of its stored images. */
  deleteCollectionPost: (id: number) => Promise<Outcome>
  collectionThumbnail: (fileName: string) => Promise<string>
  // ── Artists ──────────────────────────────────────────────────────────────────
  // A reading list kept apart from everything else — not a tag, not a shelf, nowhere on
  // the website.

  /** Every artist, never-read first, then oldest read to newest. */
  listArtists: () => Promise<Artist[]>
  createArtist: (name: string, isAi: boolean, isFavorite: boolean) => Promise<CollectionNamed>
  /** Into the archive or back out, answering with the stamp as stored. `read_at` stays. */
  setArtistArchived: (
    id: number,
    archived: boolean
  ) => Promise<{ ok: true; archived_at: string | null } | { ok: false; error: string }>
  /** Moves an artist between the reading list and the favourites; their read date stays. */
  setArtistFavorite: (id: number, isFavorite: boolean) => Promise<Outcome>
  /** Moves an artist between the non-AI and AI lists; their read date stays. */
  setArtistAi: (id: number, isAi: boolean) => Promise<Outcome>
  renameArtist: (id: number, name: string) => Promise<NamedOutcome>
  /** Stamps `read_at` with the database's `now()`, answering with the stamp as stored. */
  markArtistRead: (
    id: number
  ) => Promise<{ ok: true; read_at: string } | { ok: false; error: string }>
  /** The artist, their addresses, their examples and the examples' stored objects. */
  deleteArtist: (id: number) => Promise<Outcome>
  addArtistUrl: (
    artistId: number,
    url: string
  ) => Promise<{ ok: true; url: ArtistUrl } | { ok: false; error: string }>
  removeArtistUrl: (id: number) => Promise<Outcome>
  /** One staged file onto one artist. */
  uploadArtistImage: (artistId: number, path: string) => Promise<ArtistImageResult>
  deleteArtistImage: (id: number) => Promise<Outcome>
  artistThumbnail: (fileName: string) => Promise<string>
  /** The stored example at full size, or '' — for the viewer a click opens. */
  artistImage: (id: number) => Promise<string>

  exportSettings: () => Promise<TransferResult>
  importSettings: () => Promise<TransferResult>
  /** Reveals `save.json` — the preferences — in the OS file manager. */
  openDataFolder: () => Promise<void>
}

export type { UploadResult } from '@common/upload/pipeline'
export type { Collection, CollectionPost } from '@common/data/collections'
export type { CollectionInput } from '@common/data/collections-write'
export type { Artist, ArtistImage, ArtistUrl } from '@common/data/artists'
