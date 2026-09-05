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

function show(img) {
  build()
  const key = img.currentSrc || img.src
  if (!key) return
  showingKey = key

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
  if (!shadow) return
  shadow.getElementById('box').classList.remove('on')
  // A cached sample stays in the cache but leaves the tree, so hovering the same
  // thumbnail again is one append.
  stage.replaceChildren()
}

// ----------------------------------------------------------------- the events

function thumbUnder(target) {
  if (!(target instanceof Element)) return null
  const img =
    target instanceof HTMLImageElement ? target : target.closest('a')?.querySelector('img')
  if (!img || !img.currentSrc) return null
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
