import { useState } from 'react'
import { type TagCategory } from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD, Panel } from './panel'
import { CategoryField } from './tag-fields'

/**
 * Name a tag — an artist or a series, with the category already right. This is the only
 * way a tag comes into being: every write that names a tag resolves the names it was given
 * and fails on one the board doesn't have, rather than coining it on the way past.
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
