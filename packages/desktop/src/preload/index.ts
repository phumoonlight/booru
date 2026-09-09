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
  stageFiles: (paths) => ipcRenderer.invoke('files:stage', paths),
  fetchImages: (urls) => ipcRenderer.invoke('files:fetch', urls),
  previewFile: (path) => ipcRenderer.invoke('files:preview', path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  listTags: () => ipcRenderer.invoke('tags:list'),
  suggestTags: (query) => ipcRenderer.invoke('tags:suggest', query),
  clearTagCache: () => ipcRenderer.invoke('tags:clear-cache'),
  readBrowseCache: () => ipcRenderer.invoke('browse:read-cache'),
  writeBrowseCache: (cache) => ipcRenderer.invoke('browse:write-cache', cache),
  clearBrowseCache: () => ipcRenderer.invoke('browse:clear-cache'),
  listRules: (kind) => ipcRenderer.invoke('rules:list', kind),
  saveRule: (kind, tag, names) => ipcRenderer.invoke('rules:save', kind, tag, names),
  listFormSections: () => ipcRenderer.invoke('sections:list'),
  saveFormSections: (edit) => ipcRenderer.invoke('sections:save', edit),
  listCatalogs: () => ipcRenderer.invoke('catalogs:list'),
  saveCatalogs: (catalogs) => ipcRenderer.invoke('catalogs:save', catalogs),
  uploadPost: (request: UploadRequest) => ipcRenderer.invoke('post:upload', request),
  searchPosts: (options) => ipcRenderer.invoke('posts:search', options),
  getPost: (id) => ipcRenderer.invoke('posts:get', id),
  savePost: (request) => ipcRenderer.invoke('posts:save', request),
  deletePost: (id) => ipcRenderer.invoke('posts:delete', id),
  postThumbnail: (fileName) => ipcRenderer.invoke('posts:thumbnail', fileName),
  createTag: (name, category, sectionId) =>
    ipcRenderer.invoke('tags:create', name, category, sectionId),
  renameTag: (id, name) => ipcRenderer.invoke('tags:rename', id, name),
  setTagCategory: (id, category) => ipcRenderer.invoke('tags:set-category', id, category),
  setTagFormSection: (id, sectionId) => ipcRenderer.invoke('tags:set-section', id, sectionId),
  setTagMark: (id, mark) => ipcRenderer.invoke('tags:set-mark', id, mark),
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
  applyTagToTagged: (target, condition) => ipcRenderer.invoke('tags:apply', target, condition),
  // The one channel with nothing to answer: main only reads it when the window closes,
  // and the renderer pushes on every change, so a reply would be noise.
  reportStaged: (state: StagedState) => ipcRenderer.send('upload:state', state),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getSiteState: () => ipcRenderer.invoke('site:state'),
  saveSiteState: (input) => ipcRenderer.invoke('site:save', input),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  openDataFolder: () => ipcRenderer.invoke('shell:open-data-folder'),
}

contextBridge.exposeInMainWorld('api', api)
