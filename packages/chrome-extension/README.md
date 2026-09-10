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

The default is bigger, except on pixiv, where the listing thumbnail is a **square crop**
— the picture in the page is a piece of the post rather than a small copy of it, so the
mode that enlarges it is the one mode that cannot be right about what you are looking at.

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

**Gelbooru, Konachan and pixiv only** — see [Boards](#boards).

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
| ⚙️ Settings            | what is stored, the floor, and the import/export file |

The whole page is a **hold** rather than a click because it is the one action here that
repeating does not undo. 600ms, with the fill running under the label.

**On pixiv it leaves your bookmarks alone.** A filled heart is a post you kept to come
back to, and a blanket over the page is exactly what that should not be under — so 📚
skips them and the menu says how many it held back. Nothing else changes: they are not
faded, and clicking one in marking mode still marks it, because that is a decision about
one picture rather than a sweep. The heart is read off the page each time it is asked
about — pixiv is already holding that fact, and a copy of it here would be free to
disagree with the original.

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
database reads every record and writes it back regrouped. Version 3 adds a second store
holding one floor per board and touches the records not at all.

The database is the **extension's**, not the board's. A content script's `indexedDB`
belongs to the site it was injected into, which would have meant one store per board, none
of them reachable from a settings page, and all of them taken by a "clear site data" aimed
at something else.

### Read up to

A post number per board, set on the settings page: everything **at or below** it counts as
read without being stored, and the numbers already held inside it are deleted on the spot.

It is the one thing here that makes the database smaller rather than larger. A board
sourced from for a year is mostly a long tail of old posts that will never be opened
again, and storing each of their numbers to say so costs two bytes apiece for a fact one
number states. Fifty thousand read posts under the floor are 100KB before and nothing
after.

What it costs is that the range is a **blanket**. A post under the floor cannot be
unmarked — there is no record to remove — so the menu says so and its button is disabled
rather than shrugging. Clearing the number does not bring back what setting it deleted,
and neither does lowering it. Raising one asks first, with the count of stored posts it is
about to swallow, since "this cannot be undone" is only a warning if it says what "this"
was.

The floor is written and the prune runs in one transaction: a floor without the prune is a
saving that never happened, and a prune without the floor is read posts forgotten.

### Import and export

Settings exports every board as one JSON file: a sorted list of post numbers per board,
each board's floor, and the date it was written. The floor goes in as itself — writing out
the millions of numbers it covers would be the file saying the thing the floor exists not
to say. Import **merges** by default — read history only grows, and
two machines that have each seen something the other hasn't is the ordinary case rather
than a conflict. Replace is there for undoing an import of the wrong file. A merged floor
takes the higher of the two, for the reason merged ids take the union: both machines are
saying what has been read, and neither of them saying it makes it unread.

The settings page also says what is held per board, holds the floor, and can clear a
board — floor included, since clearing has to leave nothing fading. A board the file
brought in that this build has never heard of keeps its row, so an import is never storage
you cannot see or clear.

## Install

Brave and Chrome, unpacked:

1. `brave://extensions` (or `chrome://extensions`)
2. Developer mode on
3. **Load unpacked** → pick `packages/chrome-extension`

## Saving the picture

**Gelbooru and Konachan**, and deliberately not pixiv — see the end of this section.

On a post's own page a ⬇️ button sits on the top-left corner of the picture — the dock's
button drawn smaller, because it is the same kind of thing. Clicking it opens the save
dialog on the board's **original** file, not the sample the page is showing you, so filing
something is one click and a folder rather than right click, open in new tab, wait for the
full size, right click again.

It **straddles** the corner rather than sitting inside it: mostly outside the picture, so
it is on the edge rather than on the thing you are looking at, but not clear of it, since
a post page has no margin to rely on and a button floating in a gap that isn't there would
land on the sidebar. It is placed rather than inserted — following the corner on scroll,
clamped into the window, and hidden when that corner scrolls past — so nothing about the
board's own markup is rearranged. It sits at 40% until pointed at, and says what happened
by changing its glyph, ⏳ then ✅ or ⚠️, there being no room beside one circle for a word.

Both boards link to the original from the post — "Original image" on Gelbooru, "Download
larger version" on Konachan — so the address is recognised rather than derived, and no
extension has to be guessed at. A post small enough to have no sample is showing its
original already, and that is what gets saved. The file is named `<board>-<post>.<ext>`:
the board's own name is either an md5 or the post's whole tag list, one unreadable and the
other unwieldy, and both worse than the number that finds the post again.

The dialog is deliberate rather than a straight drop into the download folder — pictures
being sourced get filed somewhere on purpose, and choosing the folder is the reason you
were right-clicking. Chrome opens it on the last folder used, so a run of saves is one
choice and then Enter.

**pixiv has no button.** `i.pximg.net` answers 403 to a request carrying no `Referer` from
pixiv, and `chrome.downloads` sends none — setting one is the `headers` option, which needs
host access, which is the permission this extension exists without. A button that fails
every time is worse than no button, and a right click in the page sends the referer for
free. A board with no `original` in its `BOARDS` entry simply doesn't draw one.

## Permissions

Three, and no host access at all:

- **`storage`** — the marking on/off switch and which side the button sits on. These
  answer for the extension rather than for a board, so unlike the hover mode and size
  (which stay in each board's `localStorage`, deliberately per board) they have to be
  somewhere every board and the settings page can see.
- **`unlimitedStorage`** — read history has no ceiling but the one you give it, and
  hitting a quota mid-mark would lose marks silently.
- **`downloads`** — the Save button. This is the one Chrome warns about, as "Manage your
  downloads"; the other two install silently. There is no way around it: `<a download>` is
  ignored across origins and every board serves its pictures from a different host than
  its pages, so an anchor navigates to the file instead of saving it — which is the
  right-click dance the button exists to replace. `chrome.downloads` has the browser fetch
  it instead, which needs no host access.

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
engine), Danbooru, Konachan, and pixiv.

**Marking** works on Gelbooru, Konachan and pixiv. Fewer, on purpose: a post number means
nothing without knowing whose it is, and the Gelbooru engine is five sites with five
unrelated id spaces behind one set of markup. Konachan's two hosts are one board — `.net`
is the same posts with the same numbers, filtered — and pixiv's language prefix is a prefix
on the path rather than another site, so `/en/artworks/1` and `/artworks/1` are one post and
fade together.

pixiv is not a booru, and everything here is indifferent to that: what marking needs is a
number in the address and a thumbnail wrapped in a link to it, which is what an illust id
and an artwork card are. What it costs is the crop the listing draws (the mode default
above) and the save button (the referer, above). What it gains is the bookmark, which is
the one thing any of these boards says about a post that the extension did not have to
record itself.

The heart is recognised by its **colour** rather than by its label — the label is whatever
language the account is set to, and the pink is the same in all of them — inside the card
found by walking up from the thumbnail until a second post appears, since pixiv's class
names are generated and change between deploys. A range of pinks rather than the one hex
it is today: the heart is drawn through `fill` in one place and `color` in another, it is
an svg here and a glyph there, and a private bookmark puts a lock over it. What the range
must not swallow is white and grey, which is what the _unbookmarked_ heart is, and it is
scoped to the card's buttons so nothing else red on the page can answer. A hidden one does
not count — pixiv keeps both states in the markup.

The menu says the count either way, **including none**, because a selector that has gone
stale and a page with no bookmarks on it look identical from the outside otherwise.

Konachan is also the one that cannot be resolved by pattern — moebooru puts the post title
inside the file name — so its hover rule reads the `Post.register({…})` calls the page
already carries instead. Still no request. Adding yande.re, the same engine, is the two
hosts in its `host` regex and nothing else.

Adding a board to the hover is an entry in `SITES` in [src/content.js](src/content.js): a
host pattern, a regex over the thumbnail URL, and the candidate full-size URLs to try in
order — plus `defaultMode`, if the thumbnail in the page is not a small copy of the post.
Bigger mode needs none of it and works on any board in `matches`.

Adding one to the marking is an entry in `BOARDS` in the same file: a host pattern, a
function that pulls the digits out of a post URL, and `original` if the board links to the
stored file from the post. Every board's numbers are already in their addresses, so nothing
is fetched to find one. A row in `BOARDS` in
[src/options.js](src/options.js) is what makes the settings page say so before anything has
been marked.

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
