import { protocol } from 'electron'
import { artistImagePath, collectionImagePath } from '@common/storage'
import { storedImage } from './image-cache'
import { gridBox, gridImage } from './grid-image'

/**
 * `board-image://collection/<file_name>.<ext>` and `board-image://artist/…` — a shelf's image
 * or an artist's example at full size, served from `app-cache/images` and fetched into it on a
 * miss; with `?grid=<w>x<h>`, a copy cut to a tile's box (`main/grid-image.ts`). The host only
 * picks the bucket prefix; the cache is keyed by md5 and shared.
 *
 * Every image the window draws comes through here. A `data:` URL is the whole file as
 * base64, held by the page and by main, so a screenful of full sizes would be hundreds of
 * megabytes of strings; a scheme lets Chromium load, decode and drop them like any other
 * image. It is the one addition to the CSP's `img-src`, and it reaches nothing but this
 * handler — the page still has no network.
 */
const SCHEME = 'board-image'

/** Before `app.whenReady()`: a scheme's privileges can only be granted that early. */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

const NAME = /^([a-zA-Z0-9]{1,64})\.([a-zA-Z0-9]{1,8})$/

const PATHS: Record<string, (fileName: string, fileExt: string) => string> = {
  collection: collectionImagePath,
  artist: artistImagePath,
}

export function serveImages(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    const match = NAME.exec(url.pathname.slice(1))
    const pathOf = Object.hasOwn(PATHS, url.hostname) ? PATHS[url.hostname] : undefined
    if (!pathOf || !match) return new Response(null, { status: 404 })

    const [, fileName, fileExt] = match
    const path = pathOf(fileName, fileExt)
    // `?grid=<w>x<h>` is a tile asking for a copy cut to its own box in device pixels
    // (`main/grid-image.ts`); without it, the stored full size, which the viewer draws.
    const box = gridBox(url.searchParams.get('grid'))
    const image = box
      ? await gridImage(fileName, fileExt, path, box).then((bytes) =>
          bytes ? { bytes, type: 'image/webp' } : null
        )
      : await storedImage(fileName, fileExt, path)
    if (!image) return new Response(null, { status: 404 })

    return new Response(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.type,
        // The name is the md5 of the bytes, so the answer never changes
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  })
}
