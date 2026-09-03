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
  logIn: (email, password, remember) =>
    ipcRenderer.invoke('auth:log-in', email, password, remember),
  readSavedLogin: () => ipcRenderer.invoke('auth:saved-login'),
  logOut: () => ipcRenderer.invoke('auth:log-out'),
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  stageFiles: (paths) => ipcRenderer.invoke('files:stage', paths),
  fetchImages: (urls) => ipcRenderer.invoke('files:fetch', urls),
  previewFile: (path) => ipcRenderer.invoke('files:preview', path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  listTags: () => ipcRenderer.invoke('tags:list'),
  suggestTags: (query) => ipcRenderer.invoke('tags:suggest', query),
  uploadPost: (request: UploadRequest) => ipcRenderer.invoke('post:upload', request),
  // The one channel with nothing to answer: main only reads it when the window closes,
  // and the renderer pushes on every queue change, so a reply would be noise.
  reportQueue: (state: QueueState) => ipcRenderer.send('queue:state', state),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openDataFolder: () => ipcRenderer.invoke('shell:open-data-folder'),
}

contextBridge.exposeInMainWorld('api', api)
