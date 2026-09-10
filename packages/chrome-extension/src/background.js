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

  /**
   * Saving the picture, which is the other thing only this side can do.
   *
   * `<a download>` is ignored across origins and every board serves its images from a
   * different host than its pages, so the anchor would navigate to the file rather than
   * save it — which is the right-click dance this replaces. `chrome.downloads` has no
   * such rule and needs no host access, since it is the browser fetching rather than the
   * page.
   */
  if (message.type === 'download') {
    // Answered rather than dropped: the button is showing a spinner until it hears back,
    // and "no" is a better thing to hear than nothing.
    if (typeof message.url !== 'string' || !/^https?:\/\//i.test(message.url)) {
      respond({ ok: false })
      return
    }
    // `saveAs` opens the dialog rather than dropping the file in the download folder:
    // pictures being sourced are filed somewhere on purpose, and picking the folder is
    // the whole reason a person would have been right-clicking. The dialog opens on the
    // last folder used, so a run of saves into one place is one choice and then Enter.
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: true },
      () => {
        // A refused download sets `lastError`, and reading it is what marks it handled.
        respond({ ok: !chrome.runtime.lastError })
      }
    )
    return true
  }

  if (typeof message.site !== 'string' || !message.site) return

  if (message.type === 'query') {
    // The floor comes back with the answer rather than on a message of its own: the page
    // needs it for the same reason it needs the subset, and it is already in hand.
    queryReads(message.site, ids(message.ids)).then(
      (answer) => respond(answer),
      // A store that will not open is a store with nothing read in it. The board is drawn
      // as it is rather than the page failing to finish.
      () => respond({ read: [], floor: 0 })
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
