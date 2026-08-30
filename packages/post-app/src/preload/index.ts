import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppConfigInput, PostAppApi, UploadRequest } from '../shared/api'

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
  readConfig: () => ipcRenderer.invoke('app:read-config'),
  saveConfig: (config: AppConfigInput) => ipcRenderer.invoke('app:save-config', config),
  logIn: (email, password, remember) =>
    ipcRenderer.invoke('auth:log-in', email, password, remember),
  readSavedLogin: () => ipcRenderer.invoke('auth:saved-login'),
  logOut: () => ipcRenderer.invoke('auth:log-out'),
  chooseFiles: () => ipcRenderer.invoke('files:choose'),
  stageFiles: (paths) => ipcRenderer.invoke('files:stage', paths),
  fetchImages: (urls) => ipcRenderer.invoke('files:fetch', urls),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  suggestTags: (query) => ipcRenderer.invoke('tags:suggest', query),
  uploadPost: (request: UploadRequest) => ipcRenderer.invoke('post:upload', request),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openConfigFolder: () => ipcRenderer.invoke('shell:open-config-folder'),
}

contextBridge.exposeInMainWorld('api', api)
