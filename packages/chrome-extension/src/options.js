/**
 * The settings page: what is stored, the one preference, and the file.
 *
 * It opens the database directly rather than asking the worker, because it is the same
 * origin — the worker exists to give the *content script* a way in, and nothing else.
 *
 * The stored shape is bucketed and packed; the file is neither. An export is occasional,
 * read by a person and imported into a build that may pack differently, so it is a sorted
 * list of post numbers — the only thing here that was ever a fact rather than a
 * representation.
 */

import { clearSite, listFloors, listIds, markReads, setFloor, stats } from './store.js'

const FORMAT = 'booru-explorer-reads'
const PREF_KEY = 'booru-explorer-prefs'

// The boards that can be marked, so a row with nothing in it still says so — an empty
// table cannot be told apart from a broken one.
const BOARDS = [
  { key: 'gelbooru', label: 'Gelbooru' },
  { key: 'konachan', label: 'Konachan' },
]

const say = (message) => {
  document.getElementById('status').textContent = message
}

function bytes(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

async function paintStats() {
  const held = await stats().catch(() => ({}))
  const body = document.getElementById('stats')
  body.replaceChildren()
  // A board the file brought in that this build doesn't know about still has rows, and
  // dropping it from the table would make it invisible and unclearable.
  const keys = [...new Set([...BOARDS.map((entry) => entry.key), ...Object.keys(held)])]

  for (const key of keys) {
    const entry = held[key] ?? { posts: 0, bytes: 0, floor: 0 }
    const label = BOARDS.find((board) => board.key === key)?.label ?? key
    const row = document.createElement('tr')

    const name = document.createElement('td')
    name.textContent = label
    const posts = document.createElement('td')
    posts.className = 'n'
    posts.textContent = entry.posts.toLocaleString()
    const size = document.createElement('td')
    size.className = 'n'
    size.textContent = entry.posts === 0 ? '—' : bytes(entry.bytes)

    const cell = document.createElement('td')
    cell.className = 'n'
    cell.append(floorInput(key, label, entry.floor))

    const actions = document.createElement('td')
    actions.className = 'n'
    const clear = document.createElement('button')
    clear.innerHTML = '<span aria-hidden="true">🗑️</span> Clear'
    clear.disabled = entry.posts === 0 && !entry.floor
    clear.addEventListener('click', async () => {
      if (!confirm(`Forget every read post on ${label}? This cannot be undone.`)) return
      await clearSite(key)
      say(`${label} cleared.`)
      paintStats()
    })
    actions.append(clear)

    row.append(name, posts, size, cell, actions)
    body.append(row)
  }
}

/**
 * The floor, as a box you type a post number into. It applies on Enter or on leaving the
 * box rather than behind a button of its own: a number typed and then walked away from
 * means the number, and a row of five columns has no width for a sixth control.
 *
 * Raising one deletes stored posts, so it asks first — and asks with the count, since
 * "this cannot be undone" is only a warning if it says what "this" was.
 */
function floorInput(key, label, floor) {
  const box = document.createElement('input')
  box.type = 'number'
  box.min = '0'
  box.step = '1'
  box.placeholder = 'none'
  box.value = floor > 0 ? String(floor) : ''
  box.setAttribute('aria-label', `${label}: read up to`)

  const apply = async () => {
    const typed = box.value.trim()
    const next = typed === '' ? 0 : Number(typed)
    if (!Number.isInteger(next) || next < 0) {
      box.value = floor > 0 ? String(floor) : ''
      say('A floor is a post number.')
      return
    }
    if (next === floor) return

    if (next > 0) {
      // Counted before the write rather than reported after it, because the answer is
      // what the question is for: a mistyped digit is three thousand posts, and the only
      // moment that number can change anything is before Enter.
      const covered = (await listIds(key).catch(() => [])).filter((id) => id <= next).length
      const cost =
        covered === 0
          ? ''
          : ` ${covered.toLocaleString()} stored post numbers are inside it and will be deleted.`
      if (
        !confirm(
          `Everything at or below ${next.toLocaleString()} on ${label} counts as read.${cost}\n\nThis cannot be undone.`
        )
      ) {
        box.value = floor > 0 ? String(floor) : ''
        return
      }
    }

    const done = await setFloor(key, next)
    say(
      next === 0
        ? `${label} floor cleared — nothing deleted is coming back.`
        : done.removed === 0
          ? `${label} reads up to ${next.toLocaleString()}.`
          : `${label} reads up to ${next.toLocaleString()} — ${done.removed.toLocaleString()} stored posts deleted.`
    )
    paintStats()
  }

  box.addEventListener('change', apply)
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') box.blur()
  })
  return box
}

async function paintPref() {
  const box = document.getElementById('marking')
  const stored = await chrome.storage.local.get(PREF_KEY)
  box.checked = stored?.[PREF_KEY]?.marking !== false
  box.addEventListener('change', async () => {
    const current = (await chrome.storage.local.get(PREF_KEY))?.[PREF_KEY] ?? {}
    await chrome.storage.local.set({ [PREF_KEY]: { ...current, marking: box.checked } })
    say(box.checked ? 'Marking on.' : 'Marking off.')
  })
}

document.getElementById('export').addEventListener('click', async () => {
  const sites = {}
  let total = 0
  const held = await stats().catch(() => ({}))
  // The floors go in the file as themselves. Writing out the millions of numbers one
  // covers would be the file saying what the floor exists not to say, and would import
  // as a database the floor had just finished emptying.
  const floors = await listFloors().catch(() => ({}))
  for (const key of new Set([...BOARDS.map((board) => board.key), ...Object.keys(held)])) {
    const ids = await listIds(key)
    if (ids.length === 0) continue
    sites[key] = ids
    total += ids.length
  }
  if (total === 0 && Object.keys(floors).length === 0) {
    say('Nothing to export yet.')
    return
  }

  const file = { format: FORMAT, version: 1, exported: new Date().toISOString(), sites, floors }
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `booru-explorer-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  say(`Exported ${total.toLocaleString()} posts.`)
})

document.getElementById('import').addEventListener('click', () => {
  document.getElementById('file').click()
})

document.getElementById('file').addEventListener('change', async (event) => {
  const chosen = event.target.files?.[0]
  event.target.value = ''
  if (!chosen) return

  let parsed
  try {
    parsed = JSON.parse(await chosen.text())
  } catch {
    say('That file is not JSON this build can read.')
    return
  }
  if (!parsed || parsed.format !== FORMAT || !parsed.sites || typeof parsed.sites !== 'object') {
    say('That file was not written by Booru explorer.')
    return
  }

  const replace = document.getElementById('replace').checked
  const floors = parsed.floors && typeof parsed.floors === 'object' ? parsed.floors : {}
  const held = await listFloors().catch(() => ({}))
  let added = 0

  for (const key of new Set([...Object.keys(parsed.sites), ...Object.keys(floors)])) {
    // Merge is the default because read history only ever grows, and two machines that
    // have each seen something the other hasn't is the ordinary case rather than a
    // conflict. Replace is there for undoing an import that brought in the wrong file.
    if (replace) await clearSite(key)

    // The floor goes in before the ids, so the ones the file carries under it are never
    // written only to be pruned a moment later. Merged floors take the higher of the two,
    // for the reason merged ids take the union: both machines are saying what has been
    // read, and neither of them saying it makes it unread.
    const level = floors[key]
    const mine = replace ? 0 : (held[key] ?? 0)
    const next = Number.isInteger(level) && level > 0 ? Math.max(level, mine) : mine
    // Replace always writes it back, since the clear above took the one that was there.
    if (next > 0 && (replace || next !== (held[key] ?? 0))) await setFloor(key, next)

    const ids = parsed.sites[key]
    if (!Array.isArray(ids)) continue
    added += await markReads(
      key,
      ids.filter((id) => Number.isInteger(id) && id >= 0),
      true
    )
  }
  say(
    added === 0
      ? 'Nothing new — every post in that file was already read.'
      : `Imported ${added.toLocaleString()} posts.`
  )
  paintStats()
})

paintStats()
paintPref()
