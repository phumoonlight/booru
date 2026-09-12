import { useState } from 'react'
import type { Board } from '@common/board'
import { type TagCategory } from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD, Panel } from './panel'
import { CategoryField } from './tag-fields'

/**
 * Name a tag before anything carries it — an artist or a series, with the category
 * already right. This is now the only way a tag comes into being: a post write resolves
 * the names it was given and fails on one the board doesn't have, rather than coining it
 * on the way past. So the order is always this one, and the tag starts on no posts.
 *
 * **It does not ask which row of the form the tag goes on**, and a new tag is therefore on
 * none — not offered anywhere until it is filed. That is two decisions and they are made at
 * different moments: naming one is about the vocabulary, filing it is about the shape of the
 * form, and the second is a question you answer for a set of tags at once on the 🧱 Form
 * sections screen, looking at what each row already holds. Asking here got a menu answered
 * on the way past, which is how a tag ends up on the row that happened to be first.
 */
export function CreateTag({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TagCategory>('general')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const result = await window.api.createTag(name, category, null)
    setBusy(false)
    if (result.ok) {
      setMessage({ ok: true, text: `Created ${tagLabel(result.name)}.` })
      setName('')
      onDone()
    } else {
      setMessage({ ok: false, text: result.error })
    }
  }

  return (
    <Panel title="New tag">
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="blue_archive"
          spellCheck={false}
          className={`${FIELD} min-w-40 flex-1 font-mono`}
        />
        {/* Kept when the name is cleared below: naming five underwear tags in a row is what
            this form is for, and re-picking the category each time is what it saves. */}
        <CategoryField value={category} onChange={setCategory} />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
          className={BUTTON_SUBMIT_ON_SURFACE}
        >
          {/* The glyph the header item that opened this panel is drawn with, so the thing
              pressed to start and the thing pressed to finish are visibly one operation. */}
          <span aria-hidden>➕</span> Create
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-muted' : 'text-[#ff5d5f]'}`}>{message.text}</p>
      )}
    </Panel>
  )
}

/**
 * Add one tag to every post already carrying another — `swimsuit` for everything tagged
 * `bikini`. The slowest thing this window does, and the only one that reports counts:
 * "added to 3, 41 already had it" is the difference between a rule that did something
 * and one that was already satisfied.
 */
export function ApplyTag({ board, onDone }: { board: Board; onDone: () => void }) {
  const [target, setTarget] = useState('')
  const [condition, setCondition] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setMessage(null)
    const result = await window.api.applyTagToTagged(target, condition, board)
    setBusy(false)
    if (result.ok) {
      setMessage({
        ok: true,
        text: `Added ${tagLabel(result.target)} to ${result.added} post${
          result.added === 1 ? '' : 's'
        } — ${result.already} already had it.`,
      })
      onDone()
    } else {
      setMessage({ ok: false, text: result.error })
    }
  }

  return (
    <Panel title="Apply by tag">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="swimsuit"
          spellCheck={false}
          className={`${FIELD} min-w-32 flex-1 font-mono`}
        />
        <span className="text-xs text-muted">to every post tagged</span>
        <input
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          placeholder="bikini"
          spellCheck={false}
          className={`${FIELD} min-w-32 flex-1 font-mono`}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !target.trim() || !condition.trim()}
          className={BUTTON_SUBMIT_ON_SURFACE}
        >
          <span aria-hidden>🧩</span> {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-muted' : 'text-[#ff5d5f]'}`}>{message.text}</p>
      )}
    </Panel>
  )
}
