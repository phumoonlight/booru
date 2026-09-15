import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PostAppApi, PreferencesInput, StagedState, UploadRequest } from '../shared/api'

/**
 * The bridge. Nothing but these functions crosses into the page — no `ipcRenderer`, no
 * `require`, no keys — so the renderer's whole vocabulary is `PostAppApi`.
 *
 * `pathForFile` is the one that isn't a channel: a dropped `File` stopped carrying
 * `.path` in Electron 32, and `webUtils.getPathForFile` is the replacement. It has to be
 * called on this side, synchronously, while the `File` object still exists.
 */
const api: PostAppApi = {
  getStatus: () => ipcRenderer.invoke('app:status'),
  savePreferences: (preferences: PreferencesInput) =>
    ipcRenderer.invoke('app:save-preferences', preferences),
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  stageFiles: (paths, target) => ipcRenderer.invoke('files:stage', paths, target),
  fetchImages: (urls, target) => ipcRenderer.invoke('files:fetch', urls, target),
  previewFile: (path) => ipcRenderer.invoke('files:preview', path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  listTags: (board) => ipcRenderer.invoke('tags:list', board),
  suggestTags: (query, board) => ipcRenderer.invoke('tags:suggest', query, board),
  clearTagCache: () => ipcRenderer.invoke('tags:clear-cache'),
  readBrowseCache: (board) => ipcRenderer.invoke('browse:read-cache', board),
  writeBrowseCache: (cache) => ipcRenderer.invoke('browse:write-cache', cache),
  clearBrowseCache: (board) => ipcRenderer.invoke('browse:clear-cache', board),
  listRules: (kind) => ipcRenderer.invoke('rules:list', kind),
  saveRule: (kind, tag, names) => ipcRenderer.invoke('rules:save', kind, tag, names),
  listFormSections: () => ipcRenderer.invoke('sections:list'),
  saveFormSections: (edit) => ipcRenderer.invoke('sections:save', edit),
  uploadPost: (request: UploadRequest) => ipcRenderer.invoke('post:upload', request),
  searchPosts: (options) => ipcRenderer.invoke('posts:search', options),
  getPost: (id, board) => ipcRenderer.invoke('posts:get', id, board),
  savePost: (request) => ipcRenderer.invoke('posts:save', request),
  deletePost: (id, board) => ipcRenderer.invoke('posts:delete', id, board),
  postThumbnail: (fileName, board) => ipcRenderer.invoke('posts:thumbnail', fileName, board),
  createTag: (name, category, sectionId) =>
    ipcRenderer.invoke('tags:create', name, category, sectionId),
  renameTag: (id, name) => ipcRenderer.invoke('tags:rename', id, name),
  setTagCategory: (id, category) => ipcRenderer.invoke('tags:set-category', id, category),
  setTagFormSection: (id, sectionId) => ipcRenderer.invoke('tags:set-section', id, sectionId),
  setTagMark: (id, mark) => ipcRenderer.invoke('tags:set-mark', id, mark),
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
  applyTagToTagged: (target, condition, board) =>
    ipcRenderer.invoke('tags:apply', target, condition, board),
  // The one channel with nothing to answer: main only reads it when the window closes,
  // and the renderer pushes on every change, so a reply would be noise.
  reportStaged: (state: StagedState) => ipcRenderer.send('upload:state', state),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getSiteState: () => ipcRenderer.invoke('site:state'),
  saveSiteState: (input) => ipcRenderer.invoke('site:save', input),
  listCollections: () => ipcRenderer.invoke('collections:list'),
  createCollection: (input) => ipcRenderer.invoke('collections:create', input),
  editCollection: (id, input) => ipcRenderer.invoke('collections:edit', id, input),
  deleteCollection: (id) => ipcRenderer.invoke('collections:delete', id),
  listCollectionPosts: (options) => ipcRenderer.invoke('collections:posts', options),
  uploadToCollection: (request) => ipcRenderer.invoke('collections:upload', request),
  saveCollectionPost: (request) => ipcRenderer.invoke('collections:save-post', request),
  moveCollectionPost: (id, collectionId) =>
    ipcRenderer.invoke('collections:move-post', id, collectionId),
  deleteCollectionPost: (id) => ipcRenderer.invoke('collections:delete-post', id),
  collectionThumbnail: (fileName) => ipcRenderer.invoke('collections:thumbnail', fileName),
  listArtists: () => ipcRenderer.invoke('artists:list'),
  createArtist: (name, isAi, isFavorite) =>
    ipcRenderer.invoke('artists:create', name, isAi, isFavorite),
  setArtistAi: (id, isAi) => ipcRenderer.invoke('artists:set-ai', id, isAi),
  setArtistArchived: (id, archived) => ipcRenderer.invoke('artists:set-archived', id, archived),
  setArtistFavorite: (id, isFavorite) => ipcRenderer.invoke('artists:set-favorite', id, isFavorite),
  renameArtist: (id, name) => ipcRenderer.invoke('artists:rename', id, name),
  markArtistRead: (id) => ipcRenderer.invoke('artists:mark-read', id),
  deleteArtist: (id) => ipcRenderer.invoke('artists:delete', id),
  addArtistUrl: (artistId, url) => ipcRenderer.invoke('artists:add-url', artistId, url),
  removeArtistUrl: (id) => ipcRenderer.invoke('artists:remove-url', id),
  uploadArtistImage: (artistId, path) => ipcRenderer.invoke('artists:upload', artistId, path),
  deleteArtistImage: (id) => ipcRenderer.invoke('artists:delete-image', id),
  artistThumbnail: (fileName) => ipcRenderer.invoke('artists:thumbnail', fileName),
  artistImage: (id) => ipcRenderer.invoke('artists:image', id),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  openDataFolder: () => ipcRenderer.invoke('shell:open-data-folder'),
}

contextBridge.exposeInMainWorld('api', api)
