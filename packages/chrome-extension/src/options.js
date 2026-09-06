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

import { clearSite, listIds, markReads, stats } from './store.js'

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
    const entry = held[key] ?? { posts: 0, bytes: 0 }
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

    const actions = document.createElement('td')
    actions.className = 'n'
    const clear = document.createElement('button')
    clear.innerHTML = '<span aria-hidden="true">🗑️</span> Clear'
    clear.disabled = entry.posts === 0
    clear.addEventListener('click', async () => {
      if (!confirm(`Forget every read post on ${label}? This cannot be undone.`)) return
      await clearSite(key)
      say(`${label} cleared.`)
      paintStats()
    })
    actions.append(clear)

    row.append(name, posts, size, actions)
    body.append(row)
  }
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
  for (const key of new Set([...BOARDS.map((board) => board.key), ...Object.keys(held)])) {
    const ids = await listIds(key)
    if (ids.length === 0) continue
    sites[key] = ids
    total += ids.length
  }
  if (total === 0) {
    say('Nothing to export yet.')
    return
  }

  const file = { format: FORMAT, version: 1, exported: new Date().toISOString(), sites }
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
  let added = 0
  for (const [key, ids] of Object.entries(parsed.sites)) {
    if (!Array.isArray(ids)) continue
    const clean = ids.filter((id) => Number.isInteger(id) && id >= 0)
    // Merge is the default because read history only ever grows, and two machines that
    // have each seen something the other hasn't is the ordinary case rather than a
    // conflict. Replace is there for undoing an import that brought in the wrong file.
    if (replace) await clearSite(key)
    added += await markReads(key, clean, true)
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
