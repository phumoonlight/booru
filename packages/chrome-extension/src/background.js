/**
 * The one thing that owns the read-post database.
 *
 * It exists because the content script cannot. IndexedDB inside a content script is the
 * *board's* database — gelbooru's read history would live on gelbooru, konachan's on
 * konachan, neither of them reachable from a settings page, and both of them taken by a
 * "clear site data" aimed at something else. Here it is the extension's own origin: one
 * store, shared by every board, that a settings page can export and outlives whatever the
 * browser throws away for the sites.
 *
 * The messages are deliberately small. The content script sends the post numbers it can
 * see and gets back the subset that are read, so nothing here ever ships a bitmap across
 * the boundary — `chrome.runtime.sendMessage` serializes as JSON and would turn a typed
 * array into an object with four thousand numeric keys.
 *
 * A service worker is stopped whenever the browser feels like it, so nothing is cached in
 * module scope but the database handle, which `store.js` re-opens on demand.
 */

import { markReads, queryReads } from './store.js'

function ids(value) {
  return Array.isArray(value) ? value.filter((id) => Number.isInteger(id) && id >= 0) : []
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message !== 'object') return

  if (message.type === 'options') {
    // A content script cannot open the options page itself — `openOptionsPage` is not one
    // of the handful of `chrome.runtime` methods it is given.
    chrome.runtime.openOptionsPage()
    return
  }

  if (typeof message.site !== 'string' || !message.site) return

  if (message.type === 'query') {
    queryReads(message.site, ids(message.ids)).then(
      (read) => respond({ read }),
      // A store that will not open is a store with nothing read in it. The board is drawn
      // as it is rather than the page failing to finish.
      () => respond({ read: [] })
    )
    return true
  }

  if (message.type === 'mark') {
    markReads(message.site, ids(message.ids), message.read !== false).then(
      (changed) => respond({ changed }),
      () => respond({ changed: 0 })
    )
    return true
  }
})
