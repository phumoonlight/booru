import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { PostAppApi, PreferencesInput, QueueState, UploadRequest } from '../shared/api'

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
  listImplications: () => ipcRenderer.invoke('implications:list'),
  saveImplications: (rules) => ipcRenderer.invoke('implications:save', rules),
  listRecommendations: () => ipcRenderer.invoke('recommendations:list'),
  saveRecommendations: (rules) => ipcRenderer.invoke('recommendations:save', rules),
  uploadPost: (request: UploadRequest) => ipcRenderer.invoke('post:upload', request),
  searchPosts: (options) => ipcRenderer.invoke('posts:search', options),
  getPost: (id) => ipcRenderer.invoke('posts:get', id),
  savePost: (request) => ipcRenderer.invoke('posts:save', request),
  deletePost: (id) => ipcRenderer.invoke('posts:delete', id),
  postThumbnail: (fileName) => ipcRenderer.invoke('posts:thumbnail', fileName),
  createTag: (name, category) => ipcRenderer.invoke('tags:create', name, category),
  renameTag: (id, name) => ipcRenderer.invoke('tags:rename', id, name),
  setTagCategory: (id, category) => ipcRenderer.invoke('tags:set-category', id, category),
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
  applyTagToTagged: (target, condition) => ipcRenderer.invoke('tags:apply', target, condition),
  // The one channel with nothing to answer: main only reads it when the window closes,
  // and the renderer pushes on every queue change, so a reply would be noise.
  reportQueue: (state: QueueState) => ipcRenderer.send('queue:state', state),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openDataFolder: () => ipcRenderer.invoke('shell:open-data-folder'),
}

contextBridge.exposeInMainWorld('api', api)
