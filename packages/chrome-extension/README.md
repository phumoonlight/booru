# Booru hover

Hover a thumbnail on the board you are sourcing from, see it big. Written because Imagus
is slow at exactly the thing it exists for.

Not part of the site or the uploader — it never touches this project's database and
compiles nothing. It is here because sourcing images is half of using Pubooru, and the
half that happens in a browser.

## Two modes

Press **S** while a preview is up to switch. The choice is remembered per board.

**Bigger** (default) fetches nothing. The thumbnail is already decoded and sitting in the
page, so it is scaled into the viewport and drawn on the frame the pointer arrived. There
is no request to be slow and no cache to miss — it cannot lag. It is soft, and for "which
of these forty is the one I meant" soft is the whole answer.

**Sample** loads the board's ~850px rendition when you hover, for when the question is
about the picture rather than about which picture it is. One request, made when you
point. Until it lands you are looking at bigger mode, and the frame does not move when it
swaps.

Nothing is prefetched. An earlier build fetched every thumbnail on screen, which bought
an instant hover for about ten megabytes a page spent on pictures nobody looked at.

## Why it beats Imagus either way

Imagus resolves a thumbnail by **fetching** the post page or the site's API, parsing the
real address out of it, and only then loading the image. Two round trips per hover, the
first of them a whole HTML document.

Every board here already spells its full-size path out of the md5 the thumbnail URL
carries, so resolving is string work costing nothing — and in bigger mode there is no
second request at all. Konachan is the exception, and even there the addresses are read
out of the page rather than asked for.

## Install

Brave and Chrome, unpacked:

1. `brave://extensions` (or `chrome://extensions`)
2. Developer mode on
3. **Load unpacked** → pick `packages/chrome-extension`

It asks for **no permissions** — no host access, no storage, no background worker, and
nothing that would trip the "Allow User Scripts" warning. It never calls `fetch`; it
makes `<img>` elements, which need no permission and no CORS. There is no remote ruleset,
so there is nothing that can update itself into something else.

## Using it

|                          |                                                 |
| ------------------------ | ----------------------------------------------- |
| hover a thumbnail        | the picture, beside the cursor                  |
| `S`                      | switch mode, redrawing what you are pointing at |
| `+` / `-`                | preview size, in steps of 10%                   |
| `0`                      | back to 100%                                    |
| shift + wheel            | preview size, by the notch                      |
| wheel                    | scrolls the page, preview goes away             |
| Esc, click, or move away | close                                           |

100% is as large as the picture goes without touching the edges of the window, and the
setting runs from 25% to 300% of that. It **persists** — per board, like the mode — since
a screen and a pair of eyes don't change between one thumbnail and the next. The caption
shows the percentage whenever it isn't 100%, so a preview left small is never a mystery.

The caption says the pixel size and which of the two you are looking at — worth knowing
before dragging something into the uploader, since an enlarged thumbnail and a soft
sample look alike and only one of them has more detail to give.

## Boards

Gelbooru, Safebooru, Rule34, Xbooru, TBIB (all the Gelbooru 0.2 engine), Danbooru, and
Konachan.

Konachan is the one that cannot be resolved by pattern — moebooru puts the post title
inside the file name — so its rule reads the `Post.register({…})` calls the page already
carries instead. Still no request. Adding yande.re, the same engine, is the two hosts in
its `host` regex and nothing else.

Adding a board is an entry in `SITES` in [src/content.js](src/content.js): a host
pattern, a regex over the thumbnail URL, and the candidate full-size URLs to try in
order. Bigger mode needs none of it and works on any board in `matches`.

Candidates are tried in order and the first that loads wins, so guessing the extension is
safe: a miss is a 404 answered in milliseconds, and if every one of them misses the
enlarged thumbnail simply stays on screen.

## Editing

Plain JavaScript with no build step — the file the browser runs is the file in the
repository. Change it, then press ↻ on the extension card. Prettier settings are the
repo's.
