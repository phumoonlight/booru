# Booru explorer

Two things for the board you are sourcing from: hover a thumbnail to see it big, and mark
the posts you have already been through so they fade out of the next search.

Written because Imagus is slow at exactly the thing it exists for, and because running the
same tag search next week means scrolling past four hundred posts to find the forty that
are new.

Not part of the site or the uploader — it never touches this project's database and
compiles nothing. It is here because sourcing images is half of using Pubooru, and the
half that happens in a browser.

## Hovering

Press **S** while a preview is up to switch. The choice is remembered per board.

**Bigger** (default) fetches nothing. The thumbnail is already decoded and sitting in the
page, so it is scaled into the viewport and drawn on the frame the pointer arrived. There
is no request to be slow and no cache to miss — it cannot lag. It is soft, and for "which
of these forty is the one I meant" soft is the whole answer.

**Sample** loads the board's ~850px rendition when you hover, for when the question is
about the picture rather than about which picture it is. One request, made when you point.
Until it lands you are looking at bigger mode, and the frame does not move when it swaps.

Nothing is prefetched. An earlier build fetched every thumbnail on screen, which bought an
instant hover for about ten megabytes a page spent on pictures nobody looked at.

### Why it beats Imagus either way

Imagus resolves a thumbnail by **fetching** the post page or the site's API, parsing the
real address out of it, and only then loading the image. Two round trips per hover, the
first of them a whole HTML document.

Every board here already spells its full-size path out of the md5 the thumbnail URL
carries, so resolving is string work costing nothing — and in bigger mode there is no
second request at all. Konachan is the exception, and even there the addresses are read
out of the page rather than asked for.

## Marking posts read

**Gelbooru and Konachan only** — see [Boards](#boards).

A read post is **faded, and cannot be hovered**. That second half is the point. The reason
to point at a thumbnail is to ask which picture it is, and a post you have marked is one
you already answered that about; the fade is just how you can tell it will be skipped.

The 📖 button at the bottom of the page opens the menu. It starts on the left and can be
**dragged** to the right, since which side is out of the way depends on which board's
sidebar you are looking at.

|                        |                                                       |
| ---------------------- | ----------------------------------------------------- |
| 📚 Mark this page read | **hold** — every post in the listing at once          |
| ✅ Mark this post read | on a post's own page, where there is only one to mark |
| 👆 Start marking       | click thumbnails to mark them; click again to unmark  |
| 👁️ Read marking        | off, nothing fades and nothing is recorded            |
| ⚙️ Settings            | what is stored, and the import/export file            |

The whole page is a **hold** rather than a click because it is the one action here that
repeating does not undo. 600ms, with the fill running under the label.

**Marking mode** turns the grid into a set of checkboxes: a click marks instead of opening
the post, and clicking a marked one unmarks it. Hovering is off for as long as it lasts —
a preview covering the thumbnail you are about to click is in the way of it. Esc leaves,
and so does 👆 again.

### What is stored

Post numbers, and nothing else. No date, no title, no tags — the number is the whole fact,
and anything beside it would be a copy of something the board already has.

They are grouped 65536 to a record, and each record is kept in whichever of two shapes is
smaller: a sorted list of offsets at two bytes a post, or an 8KB bitmap at one bit per id
in the range. Scattered reading, which is what actually happens, stays on the list; a range
read past a quarter through flips to the bitmap. A bitmap alone would have cost 150 bytes
per post for ten thousand of them spread over a board's twelve million, and a list alone
would grow without ever collecting on the density it eventually reaches. Ten thousand read
posts is around 25KB either way.

Bucketing is also what makes a mark cheap: it rewrites one record, never the whole set.

**The bucket is wide because a record costs the same however little is in it.** Version 1
grouped 4096 to a record, which sounds tidy and is not: reading is scattered over a board's
whole history, so ten thousand posts landed about three to a bucket and spent forty bytes
of key and index overhead to hold six bytes of ids. The same ten thousand fill 184 records
at 65536 wide — 130KB down to 27KB. The width is capped there rather than measured: an
offset has to fit the `Uint16Array` the sparse shape is made of, and 65536 is its range.
Widening it is a schema change, since the bucket is half the key, so version 2 of the
database reads every record and writes it back regrouped.

The database is the **extension's**, not the board's. A content script's `indexedDB`
belongs to the site it was injected into, which would have meant one store per board, none
of them reachable from a settings page, and all of them taken by a "clear site data" aimed
at something else.

### Import and export

Settings exports both boards as one JSON file: a sorted list of post numbers per board,
and the date it was written. Import **merges** by default — read history only grows, and
two machines that have each seen something the other hasn't is the ordinary case rather
than a conflict. Replace is there for undoing an import of the wrong file.

The settings page also says what is held per board, and can clear a board.

## Install

Brave and Chrome, unpacked:

1. `brave://extensions` (or `chrome://extensions`)
2. Developer mode on
3. **Load unpacked** → pick `packages/chrome-extension`

## Permissions

Two, both of which Chrome installs without a warning, and no host access at all:

- **`storage`** — the marking on/off switch and which side the button sits on. These
  answer for the extension rather than for a board, so unlike the hover mode and size
  (which stay in each board's `localStorage`, deliberately per board) they have to be
  somewhere both boards and the settings page can see.
- **`unlimitedStorage`** — read history has no ceiling but the one you give it, and
  hitting a quota mid-mark would lose marks silently.

Neither the content script nor the worker asks for host access: a content script declared
in `matches` needs none, and nothing here calls `fetch`. Previews are `<img>` elements,
which need no permission and no CORS. There is no remote ruleset, so there is nothing that
can update itself into something else.

What did change from the version that had none of this: there is now a **service worker**,
because something has to own a database the settings page can also read.

## Using it

|                          |                                                 |
| ------------------------ | ----------------------------------------------- |
| hover a thumbnail        | the picture, beside the cursor                  |
| `S`                      | switch mode, redrawing what you are pointing at |
| `+` / `-`                | preview size, in steps of 10%                   |
| `0`                      | back to 100%                                    |
| shift + wheel            | preview size, by the notch                      |
| wheel                    | scrolls the page, preview goes away             |
| Esc, click, or move away | close, and leave marking mode                   |

100% is as large as the picture goes without touching the edges of the window, and the
setting runs from 25% to 300% of that. It **persists** — per board, like the mode — since
a screen and a pair of eyes don't change between one thumbnail and the next. The caption
shows the percentage whenever it isn't 100%, so a preview left small is never a mystery.

The caption says the pixel size and which of the two you are looking at — worth knowing
before dragging something into the uploader, since an enlarged thumbnail and a soft sample
look alike and only one of them has more detail to give.

## Boards

**Hovering** works on Gelbooru, Safebooru, Rule34, Xbooru, TBIB (all the Gelbooru 0.2
engine), Danbooru, and Konachan.

**Marking** works on Gelbooru and Konachan. Fewer, on purpose: a post number means nothing
without knowing whose it is, and the Gelbooru engine is five sites with five unrelated id
spaces behind one set of markup. Konachan's two hosts are one board — `.net` is the same
posts with the same numbers, filtered.

Konachan is also the one that cannot be resolved by pattern — moebooru puts the post title
inside the file name — so its hover rule reads the `Post.register({…})` calls the page
already carries instead. Still no request. Adding yande.re, the same engine, is the two
hosts in its `host` regex and nothing else.

Adding a board to the hover is an entry in `SITES` in [src/content.js](src/content.js): a
host pattern, a regex over the thumbnail URL, and the candidate full-size URLs to try in
order. Bigger mode needs none of it and works on any board in `matches`.

Adding one to the marking is an entry in `BOARDS` in the same file: a host pattern and a
function that pulls the digits out of a post URL. Both boards' numbers are already in their
addresses, so nothing is fetched to find one.

Candidates are tried in order and the first that loads wins, so guessing the extension is
safe: a miss is a 404 answered in milliseconds, and if every one of them misses the
enlarged thumbnail simply stays on screen.

## Files

|                                   |                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `src/content.js`                  | everything the page sees — the preview, the fade, the button, the marking          |
| `src/store.js`                    | the read-post database, packed. Extension origin: the worker and the settings page |
| `src/background.js`               | the worker, which exists so the content script has a way into that database        |
| `src/options.html` / `options.js` | what is stored, the one preference, and the file                                   |

## Editing

Plain JavaScript with no build step — the file the browser runs is the file in the
repository. Change it, then press ↻ on the extension card. Prettier settings are the
repo's.
