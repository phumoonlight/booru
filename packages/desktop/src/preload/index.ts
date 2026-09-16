import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PostAppApi, PreferencesInput } from '../shared/api'

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
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  listTags: () => ipcRenderer.invoke('tags:list'),
  clearTagCache: () => ipcRenderer.invoke('tags:clear-cache'),
  listRules: (kind) => ipcRenderer.invoke('rules:list', kind),
  saveRule: (kind, tag, names) => ipcRenderer.invoke('rules:save', kind, tag, names),
  listFormSections: () => ipcRenderer.invoke('sections:list'),
  saveFormSections: (edit) => ipcRenderer.invoke('sections:save', edit),
  createTag: (name, category, sectionId) =>
    ipcRenderer.invoke('tags:create', name, category, sectionId),
  renameTag: (id, name) => ipcRenderer.invoke('tags:rename', id, name),
  setTagCategory: (id, category) => ipcRenderer.invoke('tags:set-category', id, category),
  setTagFormSection: (id, sectionId) => ipcRenderer.invoke('tags:set-section', id, sectionId),
  setTagMark: (id, mark) => ipcRenderer.invoke('tags:set-mark', id, mark),
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getSiteState: () => ipcRenderer.invoke('site:state'),
  saveSiteState: (input) => ipcRenderer.invoke('site:save', input),
  listCollections: (force) => ipcRenderer.invoke('collections:list', force === true),
  createCollection: (input) => ipcRenderer.invoke('collections:create', input),
  editCollection: (id, input) => ipcRenderer.invoke('collections:edit', id, input),
  deleteCollection: (id) => ipcRenderer.invoke('collections:delete', id),
  listCollectionPosts: (options) => ipcRenderer.invoke('collections:posts', options),
  uploadToCollection: (request) => ipcRenderer.invoke('collections:upload', request),
  saveCollectionPost: (request) => ipcRenderer.invoke('collections:save-post', request),
  moveCollectionPosts: (ids, collectionId) =>
    ipcRenderer.invoke('collections:move-posts', ids, collectionId),
  deleteCollectionPost: (id) => ipcRenderer.invoke('collections:delete-post', id),
  collectionThumbnail: (fileName) => ipcRenderer.invoke('collections:thumbnail', fileName),
  collectionImage: (id) => ipcRenderer.invoke('collections:image', id),
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
