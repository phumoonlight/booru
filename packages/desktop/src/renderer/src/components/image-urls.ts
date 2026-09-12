/**
 * The image addresses in a drop that carried no file.
 *
 * A browser advertises the same image several ways at once. `text/uri-list` is the
 * direct one and is what Chrome, Firefox and Safari all set for a dragged `<img>`. The
 * HTML flavour is the fallback: dragging a *selection* containing an image sets that and
 * not the URI list, and the `src` has to be dug out of the markup. Plain text last —
 * dragging an address bar or a highlighted link leaves only that.
 *
 * Non-http entries are dropped here rather than in main: a `data:` URL from a canvas is
 * not something to send over the bridge, and the comment lines a uri-list may contain
 * are not addresses at all.
 *
 * Exported because the collections screen takes drops too, and a second reading of the
 * same three flavours is a second place for one browser's quirk to be handled and not the
 * other's.
 */
export function imageUrlsFrom(transfer: DataTransfer): string[] {
  const found: string[] = []

  const add = (value: string) => {
    const url = value.trim()
    if (!url || url.startsWith('#')) return
    if (!/^https?:\/\//i.test(url)) return
    if (!found.includes(url)) found.push(url)
  }

  const lines = (value: string) => value.split(/\r?\n/)

  lines(transfer.getData('text/uri-list')).forEach(add)

  if (found.length === 0) {
    const html = transfer.getData('text/html')
    if (html) {
      const parsed = new DOMParser().parseFromString(html, 'text/html')
      parsed.querySelectorAll('img').forEach((image) => add(image.getAttribute('src') ?? ''))
    }
  }

  if (found.length === 0) lines(transfer.getData('text/plain')).forEach(add)

  return found
}
