/**
 * Booru hover — the picture under the cursor, big, without waiting for it.
 *
 * Two modes, because there are two different questions you ask of a thumbnail and only
 * one of them is worth bytes.
 *
 * **Bigger** (the default) fetches nothing at all. The thumbnail is already decoded and
 * sitting in the page, so it is scaled into the viewport and drawn on the same frame the
 * pointer arrived — there is no request to be slow, no cache to miss, and no way for it
 * to lag. It is soft, and for "which of these forty is the one I meant" soft is the whole
 * answer.
 *
 * **Sample** loads the board's ~850px rendition on hover, for when the question is about
 * the picture rather than which picture it is. One request, made when you point rather
 * than in advance: an earlier build prefetched every thumbnail on screen, which made the
 * hover instant by spending ten megabytes a page on pictures nobody looked at.
 *
 * `S` switches, while a preview is up, and the choice is remembered per board.
 *
 * Either way the resolving is free. Imagus is slow because a rule fetches the post page
 * or the site's API and parses the real address out of it before any picture is asked
 * for — two round trips, the first of them a whole HTML document. Every board here
 * spells its full-size path out of the md5 the thumbnail URL already carries, so
 * resolving is string work, and the one board that can't (Konachan) publishes the
 * addresses in the page itself.
 *
 * One content script, no permissions, no background worker. It never calls fetch — it
 * makes <img> elements, which need no host access — so there is no CORS to work around,
 * no API key to go stale, and nothing that would ask you to approve running unreviewed
 * code.
 */

const CONFIG = {
  // 'bigger' — scale the thumbnail already in the page, no request.
  // 'sample' — load the board's larger rendition when you hover.
  defaultMode: 'bigger',
  // How far a thumbnail may be blown up past its own pixels. A 180px thumbnail shown at
  // 180px is not a preview, so this mode has to upscale to exist; past about four times
  // there is no more information to enlarge and it just looks broken.
  upscale: 4,
  // A real sample, though, is never upscaled — at 1:1 it is already most of the window.
  maxScale: 1,
  // Fraction of the viewport the picture may fill before the size setting is applied,
  // which is what makes 100% mean "as big as it goes without touching the edges".
  fill: 0.94,
  // How far the size setting may be taken either way. Below a quarter the preview is
  // smaller than some thumbnails; above three the upscale is all there is to see.
  sizeRange: [0.25, 3],
  // What a notch of shift+wheel, or one press of + or -, is worth.
  sizeStep: 1.1,
  // Decoded samples kept for a second look. Only what you actually hovered lands here
  // now, so this is small on purpose: a decoded 850px picture is several megabytes.
  cacheSize: 12,
}

const MODE_KEY = 'booru-hover-mode'
const SIZE_KEY = 'booru-hover-size'
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const VIDEO_EXT = ['webm', 'mp4']

/**
 * How a thumbnail's address becomes the full-size one, per board.
 *
 * The candidates are tried in order and the first that loads wins, which is what makes a
 * guessed extension safe: a miss is a 404 the browser answers in milliseconds. The sample
 * comes first deliberately — it is capped around 850px, which answers every question you
 * have while sourcing, and it arrives in a fraction of the original's bytes.
 */
const SITES = [
  {
    // The Gelbooru 0.2 engine, which is most of them: gelbooru, safebooru, rule34,
    // xbooru, tbib. `thumbnails/ab/cd/thumbnail_<md5>.jpg` is the shape.
    host: /(^|\.)(gelbooru\.com|safebooru\.org|rule34\.xxx|xbooru\.com|tbib\.org)$/i,
    thumb:
      /^(https?:\/\/[^/]+)\/thumbnails\/([\da-f]{2})\/([\da-f]{2})\/thumbnail_([\da-f]{32})\./i,
    candidates: ([, base, a, b, md5]) => [
      `${base}/samples/${a}/${b}/sample_${md5}.jpg`,
      ...IMAGE_EXT.map((ext) => `${base}/images/${a}/${b}/${md5}.${ext}`),
      ...VIDEO_EXT.map((ext) => `${base}/images/${a}/${b}/${md5}.${ext}`),
    ],
  },
  {
    // Danbooru. Its markup usually hands the answer over in a data attribute, so this
    // rule is a fallback to a fallback — but the paths are just as derivable.
    host: /(^|\.)donmai\.us$/i,
    thumb: /^(https?:\/\/[^/]+)\/(?:data\/)?preview\/([\da-f]{2})\/([\da-f]{2})\/([\da-f]{32})\./i,
    candidates: ([, base, a, b, md5]) => [
      `${base}/sample/${a}/${b}/sample-${md5}.jpg`,
      ...IMAGE_EXT.map((ext) => `${base}/original/${a}/${b}/${md5}.${ext}`),
      ...VIDEO_EXT.map((ext) => `${base}/original/${a}/${b}/${md5}.${ext}`),
    ],
  },
  {
    // Moebooru: Konachan (.com explicit, .net safe). The one board here whose full-size
    // address is *not* derivable — a file is served as
    // `/image/<md5>/Konachan.com - <id> <tags>.png`, and no amount of md5 reconstructs
    // the title in the middle of it. So the page is harvested instead: moebooru renders
    // every post on it as a `Post.register({…})` call carrying `sample_url` and
    // `file_url` outright. Still no request, just a different place to read.
    host: /(^|\.)konachan\.(com|net)$/i,
    thumb: /^(https?:\/\/[^/]+)\/(?:data\/)?preview\/([\da-f]{2})\/([\da-f]{2})\/([\da-f]{32})\./i,
    index: harvestMoebooru,
    // The bare-md5 forms, for a page the harvest came up empty on. Older moebooru serves
    // these directly; a newer one 404s and costs the chain one hop.
    candidates: ([, base, , , md5]) => [
      `${base}/sample/${md5}.jpg`,
      ...IMAGE_EXT.map((ext) => `${base}/image/${md5}.${ext}`),
    ],
  },
]

/**
 * The addresses moebooru already put on the page, by md5.
 *
 * `Post.register` is how it hands its own listing to its client-side code, so the object
 * is the board's answer rather than a guess at one — sample first, then the jpeg
 * rendition it makes of a large png, then the file itself.
 */
function harvestMoebooru() {
  const found = new Map()
  for (const script of document.scripts) {
    const text = script.textContent
    if (!text || !text.includes('Post.register')) continue
    for (const call of text.matchAll(/Post\.register\((\{[\s\S]*?\})\)/g)) {
      try {
        const post = JSON.parse(call[1])
        if (!post.md5) continue
        found.set(
          post.md5,
          [post.sample_url, post.jpeg_url, post.file_url].filter((url) => typeof url === 'string')
        )
      } catch {
        // One malformed call is not a reason to lose the rest of the page.
      }
    }
  }
  return found
}

// Rebuilt on demand and dropped whenever the page changes, since the boards that harvest
// are also the ones that can append a second page of posts into the same document.
let indexed = null

function pageIndex(site) {
  if (!indexed) indexed = site.index()
  return indexed
}

const MEDIA_URL = new RegExp(
  `^https?://\\S+\\.(${[...IMAGE_EXT, ...VIDEO_EXT].join('|')})(\\?|#|$)`,
  'i'
)

function isVideo(url) {
  const path = url.split(/[?#]/)[0].toLowerCase()
  return VIDEO_EXT.some((ext) => path.endsWith(`.${ext}`))
}

/**
 * What to load for this thumbnail, best first, or null if it isn't one. Consulted only
 * in sample mode — in bigger mode nothing here is ever asked.
 *
 * A board that spells the full size out in its own markup is believed over any rule here
 * — Danbooru's `data-file-url` is the site's answer, and it is right about exactly the
 * cases a pattern has to guess at. The scan goes by value rather than by attribute name:
 * every board names these differently, and a URL ending in `.png` is unambiguous. What
 * *is* read from the name is which rendition it holds, so a `sample` or `large` attribute
 * sorts ahead of the attribute naming the 10MB original beside it.
 */
function candidatesFor(img) {
  const preferred = []
  const rest = []
  const anchor = img.closest('a')

  for (const el of [img, img.parentElement, anchor].filter(Boolean)) {
    for (const attr of el.attributes) {
      if (attr.name === 'src' || attr.name === 'srcset') continue
      const value = attr.value.trim()
      if (!MEDIA_URL.test(value)) continue
      const rendition = /sample|large|medium/i.test(attr.name) ? preferred : rest
      rendition.push(value)
    }
  }
  // An anchor straight at the file, which is how a few boards write their "original
  // image" link and how a plain directory listing is written.
  if (anchor && MEDIA_URL.test(anchor.href)) rest.push(anchor.href)

  const found = [...preferred, ...rest]
  const src = img.currentSrc || img.src
  const site = SITES.find((entry) => entry.host.test(location.hostname))
  const match = site && src ? src.match(site.thumb) : null
  if (match) {
    // Every rule captures the md5 last, which is what the harvest is keyed by.
    const known = site.index ? pageIndex(site).get(match[4]) : null
    found.push(...(known ?? []), ...site.candidates(match))
  }

  const unique = found.filter((url, at) => found.indexOf(url) === at)
  return unique.length > 0 ? unique : null
}

// ------------------------------------------------------------------ the cache

/**
 * Loaded, decoded samples keyed by the thumbnail they came from — oldest first, so the
 * Map's own order is the eviction order. An entry is `{ urls, promise, node, failed }`,
 * and `node` is a detached element: showing it again is a `replaceChildren`, not a load.
 */
const cache = new Map()
let showingKey = null

function evict() {
  for (const [key, entry] of cache) {
    if (cache.size <= CONFIG.cacheSize) return
    if (key === showingKey) continue
    // Dropping the src is what actually releases the decoded bitmap; without it the
    // element lives on for as long as anything holds its promise.
    if (entry.node) entry.node.src = ''
    cache.delete(key)
  }
}

/**
 * Walk the candidates until one loads. A rejection means every one of them 404'd, which
 * is a thumbnail this build has no answer for — silent by design, and the enlarged
 * thumbnail stays on screen rather than the preview vanishing.
 */
function loadChain(urls) {
  let current = null
  let stopped = false

  const promise = new Promise((resolve, reject) => {
    let index = 0
    const attempt = () => {
      if (stopped) return
      if (index >= urls.length) return reject(new Error('no candidate loaded'))
      const url = urls[index++]

      if (isVideo(url)) {
        const video = document.createElement('video')
        video.muted = true
        video.loop = true
        video.autoplay = true
        video.playsInline = true
        video.preload = 'auto'
        video.addEventListener('error', attempt, { once: true })
        video.addEventListener('loadeddata', () => resolve(video), { once: true })
        current = video
        video.src = url
        return
      }

      const image = new Image()
      image.decoding = 'async'
      image.fetchPriority = 'high'
      image.addEventListener('error', attempt, { once: true })
      image.addEventListener(
        'load',
        () => {
          // Decoded before it is handed back, so the swap is a composite rather than a
          // stall on the frame the picture finally appears.
          image.decode().then(
            () => resolve(image),
            () => resolve(image)
          )
        },
        { once: true }
      )
      current = image
      image.src = url
    }
    attempt()
  })

  /**
   * Abandon whatever is on the wire. Clearing `src` is what actually tells Chromium to
   * stop the transfer — the element was never in the tree, so dropping the reference does
   * nothing on its own. The clear fires `error`, which is why `attempt` checks the flag
   * before doing anything: without it, cancelling would walk the rest of the candidates.
   */
  const stop = () => {
    stopped = true
    if (!current) return
    current.removeAttribute('src')
    if (current.load) current.load()
    current = null
  }

  return { promise, stop }
}

/**
 * The one sample that may be in flight, and why it is worth holding onto.
 *
 * Only one thumbnail is hovered at a time, so there is never a second — and until this
 * existed there was no way to take a request back. Switching to bigger mode mid-load left
 * the sample downloading in a mode whose whole claim is that it costs nothing, and worse,
 * it still resolved against the key being shown and painted itself over the thumbnail.
 */
let pending = null

function cancelPending() {
  if (!pending) return
  const { key, stop } = pending
  pending = null
  stop()
  // A half-downloaded entry is not a cached one. Dropping it means a later hover in
  // sample mode asks again, rather than waiting on a promise that will never settle.
  cache.delete(key)
}

function entryFor(img) {
  const key = img.currentSrc || img.src
  if (!key) return null
  const existing = cache.get(key)
  if (existing) return existing

  const urls = candidatesFor(img)
  if (!urls) return null

  const settled = () => {
    if (pending && pending.key === key) pending = null
  }
  const chain = loadChain(urls)
  const entry = { urls, node: null, failed: false }
  entry.promise = chain.promise.then(
    (node) => {
      entry.node = node
      settled()
      return node
    },
    (error) => {
      entry.failed = true
      settled()
      throw error
    }
  )
  // A rejection nobody happens to be waiting on is still an unhandled rejection.
  entry.promise.catch(() => {})
  cancelPending()
  pending = { key, stop: chain.stop }
  cache.set(key, entry)
  evict()
  return entry
}

// ------------------------------------------------------- the mode and the size

function readMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    if (saved === 'bigger' || saved === 'sample') return saved
  } catch {
    // A page can deny storage outright. The default is a fine answer.
  }
  return CONFIG.defaultMode
}

let mode = readMode()

function setMode(next) {
  mode = next
  try {
    localStorage.setItem(MODE_KEY, next)
  } catch {
    // Then it lasts the tab, which is better than refusing to switch.
  }
}

/**
 * How big a preview is drawn, as a multiplier on the size that fits the viewport.
 *
 * It survives the hover, which is the whole point of it being a setting rather than the
 * per-picture zoom it started as: a screen and a pair of eyes don't change between one
 * thumbnail and the next, so having to re-zoom every one of them was the annoyance.
 * Written back on a delay because a wheel notch fires a dozen times to cross a step.
 */
function readSize() {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY))
    if (saved > 0) return clampSize(saved)
  } catch {
    // A page can deny storage outright. 100% is a fine answer.
  }
  return 1
}

function clampSize(value) {
  const [low, high] = CONFIG.sizeRange
  return Math.min(high, Math.max(low, value))
}

let size = readSize()
let sizeWrite = 0

function setSize(next) {
  size = clampSize(next)
  clearTimeout(sizeWrite)
  sizeWrite = setTimeout(() => {
    try {
      localStorage.setItem(SIZE_KEY, String(size))
    } catch {
      // Then it lasts the tab.
    }
  }, 400)
  if (!shown) return
  const { width, height } = sizeOf(shown.node)
  place(width, height, limitFor(shown.source))
  repaintCaption()
}

const idle = window.requestIdleCallback
  ? window.requestIdleCallback.bind(window)
  : (fn) => setTimeout(fn, 200)

// ---------------------------------------------------------------- the overlay

let host = null
let shadow = null
let stage = null
let caption = null
let hovered = null
let shown = null
let hiddenByScroll = false
const cursor = { x: 0, y: 0 }

function build() {
  if (host) return
  // A closed shadow root, so no amount of site CSS — and boorus carry a lot of it —
  // can reach in and move, hide or restyle the one element that has to be predictable.
  host = document.createElement('div')
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none'
  shadow = host.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
    <style>
      :host { contain: layout paint; }
      #box {
        position: fixed;
        display: none;
        border-radius: 6px;
        overflow: hidden;
        background: #0b0b0f;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 18px 48px rgba(0, 0, 0, 0.65);
      }
      #box.on { display: block; }
      #stage > * { display: block; width: 100%; height: 100%; object-fit: contain; }
      #caption {
        position: absolute;
        left: 0;
        bottom: 0;
        padding: 3px 7px;
        font: 11px/1.4 system-ui, sans-serif;
        color: #fff;
        background: rgba(0, 0, 0, 0.66);
        border-top-right-radius: 6px;
        letter-spacing: 0.02em;
      }
      #caption b { font-weight: 600; color: #9ecbff; }
    </style>
    <div id="box"><div id="stage"></div><div id="caption"></div></div>
  `
  stage = shadow.getElementById('stage')
  caption = shadow.getElementById('caption')
  // documentElement rather than body: at document_start there is no body yet, and a site
  // that replaces its own body would take the overlay with it.
  document.documentElement.appendChild(host)
}

/**
 * `limit` is how far this particular picture may be scaled up: 1 for a real sample, four
 * for a thumbnail, which has to be enlarged past its own pixels or there is no preview.
 */
function place(width, height, limit) {
  const box = shadow.getElementById('box')
  const fit = Math.min(
    (innerWidth * CONFIG.fill) / width,
    (innerHeight * CONFIG.fill) / height,
    limit
  )
  const w = Math.round(width * fit * size)
  const h = Math.round(height * fit * size)

  // Beside the cursor on whichever side it fits, centred on the pointer vertically, then
  // clamped into the viewport. Placement is computed once per picture rather than per
  // mousemove — a preview that chases the pointer is harder to read than one that stays
  // where it was put.
  const gap = 18
  let x = cursor.x + gap
  if (x + w > innerWidth - 8) x = cursor.x - gap - w
  if (x < 8) x = Math.max(8, Math.round((innerWidth - w) / 2))
  let y = Math.round(cursor.y - h / 2)
  y = Math.min(Math.max(8, y), Math.max(8, innerHeight - h - 8))

  box.style.width = `${w}px`
  box.style.height = `${h}px`
  box.style.transform = `translate3d(${x}px, ${y}px, 0)`
  box.classList.add('on')
}

function sizeOf(node) {
  return {
    width: node.naturalWidth || node.videoWidth || node.width || 850,
    height: node.naturalHeight || node.videoHeight || node.height || 850,
  }
}

function limitFor(source) {
  return source === 'sample' ? CONFIG.maxScale : CONFIG.upscale
}

/**
 * The caption says which of the two pictures you are looking at, because at a glance an
 * enlarged thumbnail and a soft sample are the same thing and only one of them has more
 * detail to give. The size joins it when it isn't 100%: a setting that persists needs
 * somewhere to be read, or the day it is left at 60% is a day the extension looks broken.
 */
function repaintCaption() {
  if (!shown) return
  const { width, height } = sizeOf(shown.node)
  const other = shown.source === 'sample' ? 'thumbnail' : 'sample'
  const percent = size === 1 ? '' : ` · ${Math.round(size * 100)}%`
  caption.innerHTML = `${width}×${height} · ${shown.source}${percent} · <b>S</b> ${other}`
}

function paint(node, source) {
  const { width, height } = sizeOf(node)
  stage.replaceChildren(node)
  shown = { node, source }
  repaintCaption()
  place(width, height, limitFor(source))
  if (node.play) node.play().catch(() => {})
}

/**
 * The thumbnail itself, enlarged. Cloned rather than re-requested: the element in the
 * page is already decoded, so this is the one preview that cannot be slow. The clone is
 * stripped of the board's own attributes, which are sizing it for a grid cell.
 */
function enlarge(img) {
  const clone = img.cloneNode(false)
  clone.removeAttribute('style')
  clone.removeAttribute('class')
  clone.removeAttribute('width')
  clone.removeAttribute('height')
  clone.removeAttribute('loading')
  // Nothing that draws text. `alt` is the board's tag list on most of them, and it is
  // what fills the box in the moment before a picture decodes or if one never does.
  clone.removeAttribute('alt')
  clone.removeAttribute('title')
  // Pinned to the exact bytes the page already decoded, with nothing left that could make
  // the browser choose differently. A responsive thumbnail re-runs candidate selection
  // when it is laid out four times larger, and a `w`-descriptor set answers that by
  // fetching the biggest file it lists — a request, in the mode whose whole point is that
  // it makes none.
  clone.removeAttribute('srcset')
  clone.removeAttribute('sizes')
  clone.src = img.currentSrc || img.src
  return clone
}

/**
 * The board's own tooltip, parked for as long as the preview is up.
 *
 * Every booru writes the post's whole tag list into `title`, on the thumbnail or on the
 * anchor around it, and the browser draws that beside the cursor after a moment — which
 * is exactly where the preview was put. Forty tags of system tooltip across the picture
 * is not something the overlay's CSS can reach, a tooltip being drawn by the browser
 * rather than by the page. So the attribute is moved aside and put back on hide: the page
 * keeps its tooltip, and a hover with the extension turned off is unchanged.
 */
const PARKED = 'data-booru-hover-title'
let muted = []

function muteTooltips(img) {
  const anchor = img.closest('a')
  muted = [img, img.parentElement, anchor].filter((el) => el && el.hasAttribute('title'))
  for (const el of muted) {
    el.setAttribute(PARKED, el.getAttribute('title'))
    el.removeAttribute('title')
  }
}

function restoreTooltips() {
  for (const el of muted) {
    const parked = el.getAttribute(PARKED)
    if (parked !== null) el.setAttribute('title', parked)
    el.removeAttribute(PARKED)
  }
  muted = []
}

function show(img) {
  build()
  const key = img.currentSrc || img.src
  if (!key) return
  showingKey = key
  // Whatever was parked belongs to the last thumbnail, which may not be this one — a
  // mode switch re-shows the same one, and a slide along a row shows the next.
  restoreTooltips()
  muteTooltips(img)

  // Bigger mode is the mode that costs nothing, and that has to include a sample started
  // before the switch: the bytes are still arriving, and the load would still resolve
  // against the key on screen and paint itself over the thumbnail when it did.
  if (mode !== 'sample') cancelPending()

  const entry = mode === 'sample' ? entryFor(img) : null
  if (entry && entry.node) {
    paint(entry.node, 'sample')
    return
  }

  // Bigger mode stops here, and so does the first frame of sample mode: the thumbnail
  // goes up immediately either way, and in sample mode the real one replaces it when it
  // arrives. Nothing about the frame moves when it does.
  paint(enlarge(img), 'thumbnail')
  if (!entry || entry.failed) return

  entry.promise.then(
    (node) => {
      // Still pointing at it, and still asking for samples — a mode switch between the
      // request and its answer is a change of mind, not a slow frame.
      if (showingKey === key && mode === 'sample') paint(node, 'sample')
    },
    () => {
      // Every candidate 404'd. The enlarged thumbnail is still on screen and is still
      // the best answer available, so it stays.
    }
  )
}

function hide() {
  hovered = null
  showingKey = null
  shown = null
  restoreTooltips()
  if (!shadow) return
  shadow.getElementById('box').classList.remove('on')
  // A cached sample stays in the cache but leaves the tree, so hovering the same
  // thumbnail again is one append.
  stage.replaceChildren()
}

// ----------------------------------------------------------------- the events

function thumbUnder(target) {
  if (!(target instanceof Element)) return null
  // In marking mode the grid answers a different question, and a preview covering the
  // thumbnail you are about to click is in the way of it.
  if (marking) return null
  const img =
    target instanceof HTMLImageElement ? target : target.closest('a')?.querySelector('img')
  if (!img || !img.currentSrc) return null
  // A post marked read is not previewed. "Which picture is this" is the only question a
  // preview answers, and it is the question marking the post already answered — so the
  // fade is not decoration, it is what a thumbnail that has stopped responding looks
  // like.
  if (img.closest(`[${READ_ATTR}]`)) return null
  // A picture already large on the page is not worth covering with itself.
  return img.clientWidth > 0 && img.clientWidth < 400 ? img : null
}

// Capture, so a board that stops `mouseover` on its own thumbnails doesn't stop this.
document.addEventListener(
  'mouseover',
  (event) => {
    cursor.x = event.clientX
    cursor.y = event.clientY
    const img = thumbUnder(event.target)
    if (!img) {
      if (hovered && event.target instanceof Node && !hovered.contains(event.target)) hide()
      return
    }
    if (img === hovered) return
    hovered = img
    hiddenByScroll = false
    show(img)
  },
  true
)

document.addEventListener(
  'mousemove',
  (event) => {
    cursor.x = event.clientX
    cursor.y = event.clientY
    // Scrolling puts the preview away, but the pointer usually ends up over a thumbnail
    // without ever crossing into it, so no `mouseover` fires. Moving the mouse is the
    // signal that you are pointing at something on purpose again.
    if (!hiddenByScroll) return
    const img = thumbUnder(event.target)
    if (!img) return
    hiddenByScroll = false
    hovered = img
    show(img)
  },
  true
)

document.addEventListener('mouseout', (event) => {
  if (!hovered) return
  const to = event.relatedTarget
  if (to instanceof Node && hovered.contains(to)) return
  if (thumbUnder(to)) return
  hide()
})

document.addEventListener(
  'wheel',
  (event) => {
    if (!showingKey) return
    // Shift zooms; a plain wheel scrolls the page and puts the preview away. The other
    // way round — a plain wheel zooming, as Imagus does it — means the grid can only be
    // scrolled from a gap between thumbnails, which on a full page is nowhere.
    if (!event.shiftKey) {
      hiddenByScroll = true
      hide()
      return
    }
    event.preventDefault()
    setSize(size * (event.deltaY < 0 ? CONFIG.sizeStep : 1 / CONFIG.sizeStep))
  },
  { passive: false }
)

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape') return hide()
    // Only while a preview is up, so `s` stays the board's own key the rest of the time.
    if (!showingKey || !hovered) return
    if (event.ctrlKey || event.altKey || event.metaKey) return

    // Both settings answer for the picture you are pointing at, immediately — a size you
    // have to hover something else to see the effect of is one you cannot judge.
    if (event.key === 's' || event.key === 'S') {
      event.preventDefault()
      event.stopPropagation()
      setMode(mode === 'sample' ? 'bigger' : 'sample')
      show(hovered)
      return
    }
    // `=` is the unshifted key `+` lives on, and both are sent depending on the layout.
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      event.stopPropagation()
      setSize(size * CONFIG.sizeStep)
      return
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      event.stopPropagation()
      setSize(size / CONFIG.sizeStep)
      return
    }
    if (event.key === '0') {
      event.preventDefault()
      event.stopPropagation()
      setSize(1)
    }
  },
  true
)

document.addEventListener('mousedown', hide, true)
addEventListener('blur', hide)

// The harvested index is the only thing that goes stale, and it does so when a board
// appends a second page of posts into the same document. Batched into an idle callback
// because a booru grid mutates in bursts.
let scanQueued = false
new MutationObserver(() => {
  if (scanQueued || !indexed) return
  scanQueued = true
  idle(() => {
    scanQueued = false
    indexed = null
  })
}).observe(document.documentElement, { childList: true, subtree: true })

// ------------------------------------------------------------------ read posts

/**
 * Which posts you have already looked at, and the button that says so.
 *
 * Sourcing a board is a search run again next week against a listing that has moved by
 * forty posts. The forty are the point and the rest is the work, so the thing worth
 * recording is the narrowest possible fact — a post number — and the thing worth doing
 * with it is getting it out of the way.
 *
 * A read post is **faded and cannot be hovered**. The fade alone would have been
 * decoration: the reason to point at a thumbnail is to ask which picture it is, and that
 * is a question already answered for a post marked read. Skipping it is the feature; the
 * fade is how you can tell it will be skipped.
 *
 * Nothing here is stored in the page. The numbers live in the extension's own database
 * behind `background.js`, which is what lets one settings page export both boards and
 * what keeps a board's "clear site data" from taking the history with it.
 */

/**
 * The boards this applies to, and how a post's number is read out of a link.
 *
 * Fewer boards than the preview works on, on purpose: a number means nothing without
 * knowing whose it is, and the gelbooru *engine* is five sites with five unrelated id
 * spaces behind one set of markup. Adding one is an entry here — a host and a function
 * that pulls the digits out of a URL — and nothing else. Konachan's two hosts are one
 * board: `.net` is the same posts with the same numbers, filtered.
 */
const BOARDS = [
  {
    key: 'gelbooru',
    label: 'Gelbooru',
    host: /(^|\.)gelbooru\.com$/i,
    postId(url) {
      const query = url.searchParams
      if (query.get('page') !== 'post' || query.get('s') !== 'view') return null
      return digits(query.get('id'))
    },
  },
  {
    key: 'konachan',
    label: 'Konachan',
    host: /(^|\.)konachan\.(com|net)$/i,
    postId(url) {
      const match = url.pathname.match(/^\/post\/show\/(\d+)/)
      return match ? Number(match[1]) : null
    },
  },
]

function digits(value) {
  return value && /^\d+$/.test(value) ? Number(value) : null
}

const board = BOARDS.find((entry) => entry.host.test(location.hostname)) ?? null

/**
 * The post a link goes to, or null if it isn't one. Same string work as everything else
 * here — the number is already in the address, so nothing is fetched to find it.
 */
function postIdOf(href) {
  try {
    const url = new URL(href, location.href)
    if (!board.host.test(url.hostname)) return null
    return board.postId(url)
  } catch {
    return null
  }
}

// The attribute the fade and the marking outline hang off. Written onto the anchor, which
// is the element that wraps the thumbnail on both boards and is the thing you click.
const POST_ATTR = 'data-booru-post'
const READ_ATTR = 'data-booru-read'
const MARKING_ATTR = 'data-booru-marking'

/**
 * Preferences, in `chrome.storage` rather than `localStorage`, because these answer for
 * the extension rather than for a board. Mode and size stay where they are: a screen and
 * a pair of eyes are per board by design, and read history is not.
 */
const PREF_KEY = 'booru-explorer-prefs'
const prefs = { marking: true, side: 'left' }

function loadPrefs() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(PREF_KEY, (stored) => {
        if (!chrome.runtime.lastError && stored && stored[PREF_KEY]) {
          Object.assign(prefs, stored[PREF_KEY])
        }
        resolve()
      })
    } catch {
      // An extension reloaded under a page leaves the old context invalidated. The
      // defaults are a fine answer, and the next page load gets the real ones.
      resolve()
    }
  })
}

function savePrefs() {
  try {
    chrome.storage.local.set({ [PREF_KEY]: { ...prefs } })
  } catch {
    // Then it lasts the tab.
  }
}

// Ids already asked about, so a board that appends a second page only asks about the new
// ones, and the answers, which are what the fade and the hover check consult.
const seen = new Set()
const readIds = new Set()
const examined = new WeakSet()
let marking = false

function send(message, then) {
  try {
    chrome.runtime.sendMessage(message, (answer) => {
      // Reading `lastError` is what marks it handled; without this an unanswered message
      // is a console error on every page.
      if (chrome.runtime.lastError) return
      if (then) then(answer)
    })
  } catch {
    // The extension was reloaded out from under this page.
  }
}

/**
 * Find the post links that have appeared and ask about the ones we haven't. Anchors are
 * remembered in a WeakSet rather than tagged, so the ones that aren't posts — and a booru
 * page is mostly those — are examined once and never again.
 */
function scan() {
  const fresh = []
  let found = 0
  for (const anchor of document.links) {
    if (examined.has(anchor)) continue
    examined.add(anchor)
    if (!anchor.querySelector('img')) continue
    const id = postIdOf(anchor.href)
    if (id === null) continue
    anchor.setAttribute(POST_ATTR, String(id))
    found += 1
    if (!seen.has(id)) {
      seen.add(id)
      fresh.push(id)
    }
  }
  // Painting is on anything new appearing, not on anything new being *asked* about — a
  // post that turns up a second time on the same page already has its answer, and
  // waiting for a query that will never be sent would leave that copy of it unfaded.
  if (found === 0) return
  paintRead()
  if (fresh.length === 0) return
  send({ type: 'query', site: board.key, ids: fresh }, (answer) => {
    if (!answer || !Array.isArray(answer.read)) return
    for (const id of answer.read) readIds.add(id)
    paintRead()
  })
}

function paintRead() {
  for (const anchor of document.querySelectorAll(`[${POST_ATTR}]`)) {
    const id = Number(anchor.getAttribute(POST_ATTR))
    if (prefs.marking && readIds.has(id)) anchor.setAttribute(READ_ATTR, '')
    else anchor.removeAttribute(READ_ATTR)
  }
  repaintDock()
}

/**
 * Write the marks. The page is repainted first and the store told after: a click that
 * waits on a round trip before the thumbnail dims feels like it missed, and there is
 * nothing a failed write could have done differently anyway.
 */
function mark(ids, read) {
  if (ids.length === 0) return
  for (const id of ids) {
    seen.add(id)
    if (read) readIds.add(id)
    else readIds.delete(id)
  }
  paintRead()
  send({ type: 'mark', site: board.key, ids, read })
}

function pageIds() {
  const ids = new Set()
  for (const anchor of document.querySelectorAll(`[${POST_ATTR}]`)) {
    ids.add(Number(anchor.getAttribute(POST_ATTR)))
  }
  return [...ids]
}

/**
 * The fade and the marking outline, in the page's own stylesheet rather than the
 * overlay's — these style the board's elements, which nothing inside a shadow root can
 * reach. Colours that read on both a light gelbooru and a dark konachan, since a dashed
 * grey outline is invisible on one of them.
 */
function injectStyle() {
  const style = document.createElement('style')
  style.textContent = `
    [${READ_ATTR}] { opacity: .28; transition: opacity .15s ease }
    [${READ_ATTR}]:hover { opacity: .5 }
    html[${MARKING_ATTR}] [${POST_ATTR}] {
      cursor: copy;
      outline: 1px dashed rgba(30, 136, 255, .5);
      outline-offset: 2px;
    }
    html[${MARKING_ATTR}] [${POST_ATTR}]:hover { outline: 2px solid #1e88ff }
    html[${MARKING_ATTR}] [${READ_ATTR}] { outline-color: #12b76a }
  `
  document.documentElement.appendChild(style)
}

// ------------------------------------------------------------------- the dock

let dockShadow = null
let dockHost = null

/**
 * One button at the bottom of the page, and the menu it opens.
 *
 * Its own closed shadow root, separate from the preview's: that one is
 * `pointer-events:none` over the whole viewport on purpose, and this is the one thing in
 * the extension you are meant to be able to click. It sits on the left and can be dragged
 * to the right, because which side is out of the way depends on which board's sidebar you
 * are looking at.
 */
function buildDock() {
  if (dockHost) return
  dockHost = document.createElement('div')
  dockHost.style.cssText =
    'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none'
  dockShadow = dockHost.attachShadow({ mode: 'closed' })
  dockShadow.innerHTML = `
    <style>
      :host { contain: layout paint }
      #dock {
        position: fixed;
        bottom: 18px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        pointer-events: auto;
        font: 13px/1.4 system-ui, sans-serif;
        color: #e6e6ea;
      }
      #dock.right { align-items: flex-end }
      #fab {
        all: unset;
        box-sizing: border-box;
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        font-size: 20px;
        border-radius: 50%;
        background: #14141a;
        cursor: grab;
        touch-action: none;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, .18), 0 8px 24px rgba(0, 0, 0, .5);
      }
      #fab:active { cursor: grabbing }
      #fab.on { background: #1e88ff; box-shadow: 0 0 0 1px #1e88ff, 0 10px 28px rgba(30, 136, 255, .5) }
      #fab.off { opacity: .45 }
      #menu {
        min-width: 236px;
        padding: 6px;
        border-radius: 10px;
        background: #14141a;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, .14), 0 18px 48px rgba(0, 0, 0, .6);
      }
      #menu[hidden] { display: none }
      .item {
        all: unset;
        box-sizing: border-box;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 9px 10px;
        border-radius: 7px;
        cursor: pointer;
      }
      .item:hover { background: #22222c; color: #fff }
      .item[disabled] { opacity: .35; cursor: default }
      .item[disabled]:hover { background: transparent; color: #e6e6ea }
      .fill {
        position: absolute;
        inset: 0 auto 0 0;
        width: 0;
        background: rgba(30, 136, 255, .4);
        pointer-events: none;
      }
      .item.holding .fill { width: 100%; transition: width 600ms linear }
      .label { position: relative }
      .state { position: relative; margin-left: auto; font-size: 11px; opacity: .55; letter-spacing: .04em }
      #note { padding: 5px 10px 6px; font-size: 11px; opacity: .45 }
    </style>
    <div id="dock">
      <div id="menu" hidden>
        <button class="item" id="all">
          <span class="fill"></span>
          <span class="label" aria-hidden="true">📚</span>
          <span class="label">Mark this page read</span>
          <span class="state">hold</span>
        </button>
        <button class="item" id="one">
          <span aria-hidden="true">✅</span>
          <span id="one-label">Mark this post read</span>
        </button>
        <button class="item" id="pick">
          <span aria-hidden="true">👆</span>
          <span id="pick-label">Start marking</span>
        </button>
        <button class="item" id="power">
          <span aria-hidden="true">👁️</span>
          <span>Read marking</span>
          <span class="state" id="power-state">on</span>
        </button>
        <button class="item" id="settings">
          <span aria-hidden="true">⚙️</span>
          <span>Settings</span>
        </button>
        <div id="note"></div>
      </div>
      <button id="fab" aria-label="Booru explorer" title="Booru explorer">📖</button>
    </div>
  `
  document.documentElement.appendChild(dockHost)
  wireDock()
  repaintDock()
}

function dockPart(id) {
  return dockShadow ? dockShadow.getElementById(id) : null
}

function menuOpen() {
  const menu = dockPart('menu')
  return Boolean(menu) && !menu.hidden
}

function closeMenu() {
  const menu = dockPart('menu')
  if (menu) menu.hidden = true
}

function repaintDock() {
  if (!dockShadow) return
  const dock = dockPart('dock')
  const fab = dockPart('fab')
  dock.classList.toggle('right', prefs.side === 'right')
  // Cleared rather than left where a drag put it — snapping is what the release means.
  dock.style.left = prefs.side === 'right' ? 'auto' : '18px'
  dock.style.right = prefs.side === 'right' ? '18px' : 'auto'
  fab.classList.toggle('on', marking)
  fab.classList.toggle('off', !prefs.marking)

  dockPart('pick-label').textContent = marking ? 'Stop marking' : 'Start marking'
  dockPart('power-state').textContent = prefs.marking ? 'on' : 'off'
  dockPart('pick').disabled = !prefs.marking
  dockPart('all').disabled = !prefs.marking

  // The one item that isn't about the listing: on a post's own page there is exactly one
  // thing to mark, and the menu says which way it would go.
  const current = postIdOf(location.href)
  dockPart('one').disabled = !prefs.marking || current === null
  dockPart('one-label').textContent =
    current !== null && readIds.has(current) ? 'Mark this post unread' : 'Mark this post read'

  const ids = pageIds()
  const read = ids.filter((id) => readIds.has(id)).length
  dockPart('note').textContent = !prefs.marking
    ? 'Marking is off — nothing is faded or recorded.'
    : ids.length === 0
      ? current === null
        ? 'No posts on this page.'
        : `Post ${current}.`
      : `${read} of ${ids.length} read on this page.`
}

function setMarking(next) {
  marking = next && prefs.marking
  document.documentElement.toggleAttribute(MARKING_ATTR, marking)
  // Whatever the pointer was over belongs to the other mode.
  hide()
  repaintDock()
}

function wireDock() {
  const fab = dockPart('fab')
  const menu = dockPart('menu')
  const dock = dockPart('dock')

  // A drag and a click are the same gesture until the pointer moves, so the fab decides
  // between them on release rather than committing at the start.
  let drag = null
  fab.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, moved: false }
    fab.setPointerCapture(event.pointerId)
  })
  fab.addEventListener('pointermove', (event) => {
    if (!drag) return
    if (Math.abs(event.clientX - drag.x) > 6) drag.moved = true
    if (!drag.moved) return
    closeMenu()
    dock.style.left = `${Math.round(event.clientX - 22)}px`
    dock.style.right = 'auto'
  })
  fab.addEventListener('pointerup', (event) => {
    const gesture = drag
    drag = null
    if (!gesture) return
    if (gesture.moved) {
      prefs.side = event.clientX > innerWidth / 2 ? 'right' : 'left'
      savePrefs()
      repaintDock()
      return
    }
    menu.hidden = !menu.hidden
    repaintDock()
  })

  /**
   * A whole page at once is the one action here that cannot be undone by repeating it, so
   * it is held rather than clicked. 600ms with the fill running under the label — long
   * enough that it cannot be a slip, short enough that it isn't a chore.
   */
  const all = dockPart('all')
  let holding = 0
  const startHold = () => {
    if (all.disabled) return
    all.classList.add('holding')
    holding = setTimeout(() => {
      all.classList.remove('holding')
      mark(pageIds(), true)
      closeMenu()
    }, 600)
  }
  const cancelHold = () => {
    clearTimeout(holding)
    all.classList.remove('holding')
  }
  all.addEventListener('pointerdown', startHold)
  all.addEventListener('pointerup', cancelHold)
  all.addEventListener('pointerleave', cancelHold)

  dockPart('one').addEventListener('click', () => {
    const current = postIdOf(location.href)
    if (current === null) return
    mark([current], !readIds.has(current))
  })

  dockPart('pick').addEventListener('click', () => {
    setMarking(!marking)
    closeMenu()
  })

  dockPart('power').addEventListener('click', () => {
    prefs.marking = !prefs.marking
    savePrefs()
    if (!prefs.marking) setMarking(false)
    paintRead()
  })

  dockPart('settings').addEventListener('click', () => {
    send({ type: 'options' })
    closeMenu()
  })
}

// ------------------------------------------------------- marking, and the page

/**
 * In marking mode a thumbnail is a checkbox, so the board's own navigation has to be
 * stopped on the way down — a booru thumbnail is an anchor, and by the time a bubbled
 * handler sees the click the tab is already opening.
 */
document.addEventListener(
  'mousedown',
  (event) => {
    if (!marking || !(event.target instanceof Element)) return
    if (!event.target.closest(`[${POST_ATTR}]`)) return
    event.preventDefault()
    event.stopPropagation()
  },
  true
)

document.addEventListener(
  'click',
  (event) => {
    if (!marking || !(event.target instanceof Element)) return
    const anchor = event.target.closest(`[${POST_ATTR}]`)
    if (!anchor) return
    event.preventDefault()
    event.stopPropagation()
    const id = Number(anchor.getAttribute(POST_ATTR))
    // The same click both ways — a mode you can only mark in is a mode you get stuck in
    // one post past where you meant to stop.
    mark([id], !readIds.has(id))
  },
  true
)

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape') return
    if (marking) setMarking(false)
    closeMenu()
  },
  true
)

// A click anywhere in the page closes the menu. Events from inside the shadow root are
// retargeted to the host, so the host is what "not the menu" is measured against.
document.addEventListener(
  'mousedown',
  (event) => {
    if (!menuOpen() || event.target === dockHost) return
    closeMenu()
  },
  true
)

if (board) {
  injectStyle()
  loadPrefs().then(() => {
    buildDock()
    scan()
  })
  document.addEventListener('DOMContentLoaded', scan)

  // The settings page can turn marking off while a board is open, and a fade that only
  // answers on reload is a setting you cannot tell had any effect.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[PREF_KEY]) return
      Object.assign(prefs, changes[PREF_KEY].newValue ?? {})
      if (!prefs.marking) setMarking(false)
      paintRead()
    })
  } catch {
    // An invalidated context. The next page load reads them fresh.
  }

  // Both boards append rather than reload — gelbooru through its own pagination, konachan
  // when a listing grows — and a post that arrives unfaded is one you look at twice.
  let rescanQueued = false
  new MutationObserver(() => {
    if (rescanQueued) return
    rescanQueued = true
    idle(() => {
      rescanQueued = false
      scan()
    })
  }).observe(document.documentElement, { childList: true, subtree: true })
}
