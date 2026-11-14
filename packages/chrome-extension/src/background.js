/**
 * One-time cleanup, and nothing else.
 *
 * Up to 1.4.x this extension kept a read-post database (IndexedDB `booru-explorer`) and its
 * preferences in `chrome.storage.local`. Read marking moved to Read Tracker, which already
 * has that history imported, so on the update to 1.5.0 both are deleted rather than left
 * as storage nothing reads and nothing can clear.
 *
 * Removable in a later version, once every installed copy has been through 1.5.0 — and
 * when it goes, `background` goes from manifest.json with it, along with this file.
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'update') return
  indexedDB.deleteDatabase('booru-explorer')
  chrome.storage.local.clear()
})
