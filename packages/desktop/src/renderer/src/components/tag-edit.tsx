import { useState } from 'react'
import { isSpacer, type Tag, type TagCategory } from '@common/tags'
import { tagLabel } from '@common/search'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD, Panel } from './panel'
import { TagMark } from './tag-mark'
import { CategoryField, SectionField } from './tag-fields'
import { TagRuleEditor } from './tag-rule-editor'
import { useImplications } from '../implications'
import { useRecommendations } from '../recommendations'
import type { FormSection } from '@common/data/form-sections'

/**
 * One tag: rename it, recategorize it, delete it, or go and look at it on the board.
 *
 * Rename keeps the row's id, so every link and every post keeps the tag — only the text
 * moves. Delete does not: it takes the tag off every post carrying it, which is why it
 * takes a second press that says so.
 */
export function EditTag({
  tag,
  onBrowse,
  sections,
  onClose,
  onDone,
}: {
  tag: Tag
  onBrowse: (query: string) => void
  sections: FormSection[]
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(tag.name)
  const [category, setCategory] = useState<TagCategory>(tag.category)
  const [section, setSection] = useState<number | null>(tag.form_section_id ?? null)
  const [mark, setMark] = useState(tag.mark ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Opens by itself for a tag that already has rules — the panel then shows what this
  // machine does with the tag as well as what the board knows about it, which is the
  // whole reason the rules moved here. A tag with none stays a four-field row.
  //
  // null is "nobody has said", not "closed", so the default can follow the rules rather
  // than the moment: they are read from disk once per window, and seeding `useState` from
  // a count that has not landed yet would leave the very first tag opened in a session
  // folded shut with rules in it. Once toggled, the toggle wins.
  const implications = useImplications()
  const recommendations = useRecommendations()
  const ruleCount = (implications[tag.name]?.length ?? 0) + (recommendations[tag.name]?.length ?? 0)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const showRules = toggled ?? ruleCount > 0

  async function save() {
    setBusy(true)
    setError('')
    if (name !== tag.name) {
      const renamed = await window.api.renameTag(tag.id, name)
      if (!renamed.ok) {
        setBusy(false)
        setError(renamed.error)
        return
      }
    }
    if (category !== tag.category) {
      const recategorized = await window.api.setTagCategory(tag.id, category)
      if (!recategorized.ok) {
        setBusy(false)
        setError(recategorized.error)
        return
      }
    }
    // Independent of the category, and in either order: recategorizing leaves the column
    // alone now that a section is a row of the form rather than a division of a category.
    if (section !== (tag.form_section_id ?? null)) {
      const moved = await window.api.setTagFormSection(tag.id, section)
      if (!moved.ok) {
        setBusy(false)
        setError(moved.error)
        return
      }
    }
    if (mark !== (tag.mark ?? '')) {
      const marked = await window.api.setTagMark(tag.id, mark)
      if (!marked.ok) {
        setBusy(false)
        setError(marked.error)
        return
      }
    }
    setBusy(false)
    onDone()
  }

  async function remove() {
    setBusy(true)
    setError('')
    const result = await window.api.deleteTag(tag.id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onDone()
  }

  const changed =
    name !== tag.name ||
    category !== tag.category ||
    section !== (tag.form_section_id ?? null) ||
    mark !== (tag.mark ?? '')

  return (
    <Panel
      pinned
      title={`${tagLabel(tag.name)} · ${tag.post_count} post${tag.post_count === 1 ? '' : 's'}`}
      actions={
        <>
          {/* Leads the row because it is the one action here that is about this machine
              rather than about the board, and because the count answers the question
              before the panel is opened: a tag with no rules is most tags. */}
          <button
            type="button"
            // Nothing to end any more: the rules are written from their own boxes, so
            // folding the panel away takes the boxes with it and leaves nothing behind
            // claiming the next click on the grid.
            onClick={() => setToggled(!showRules)}
            className={`${BUTTON_ON_SURFACE} ${showRules ? 'text-accent' : ''}`}
          >
            🔗 Rules{ruleCount > 0 ? ` (${ruleCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy || confirming}
            className={`${BUTTON_ON_SURFACE} hover:text-[#ff5d5f]`}
          >
            🗑️ Delete
          </button>
          {/* Its posts, in this window rather than in the browser. It used to open
              /tags/<id> on the site, which answered the question in a place that can only
              read: the reason you look at what a tag is on is usually to fix one of them,
              and every control for that is in Browse. Same question, and now the answer
              is somewhere you can act on it. */}
          <button
            type="button"
            onClick={() => onBrowse(tag.name)}
            title={`Browse the posts tagged ${tagLabel(tag.name)}`}
            className={BUTTON_ON_SURFACE}
          >
            🔍 Browse
          </button>
          <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
            ❌ Close
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* In front of the name, where what it holds is drawn — and drawn *as* it will be
            drawn, so a hex is a dot here before it is a dot on the board. Wide enough for
            `#7fc8ff` now that a colour goes in the same box as an emoji; an empty box
            clears the column. */}
        <span className="flex shrink-0 items-center gap-1.5">
          <input
            value={mark}
            onChange={(event) => setMark(event.target.value)}
            disabled={busy}
            aria-label={`Mark in front of ${tagLabel(tag.name)}`}
            title="An emoji, a #hex colour, or a CSS colour name. Empty for none."
            placeholder="🎀"
            spellCheck={false}
            className={`${FIELD} w-28 px-2 text-center font-mono`}
          />
          <TagMark mark={mark} />
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
          className={`${FIELD} min-w-40 flex-1 font-mono`}
        />
        {/* Two independent answers about one tag: what it is, and where it is offered.
            Changing the category used to clear the row, because the row belonged to the
            category it was under — it does not any more. */}
        <CategoryField value={category} onChange={setCategory} disabled={busy} />
        <SectionField
          value={section}
          onChange={setSection}
          options={sections.filter((row) => !isSpacer(row.name))}
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed}
          className={BUTTON_SUBMIT_ON_SURFACE}
        >
          <span aria-hidden>💾</span> {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}

      {/* This machine's rules about this tag, under the board's own facts about it, and
          folded away until asked for. The panel is pinned to the top of a scroller so the
          row you clicked stays in view; two tag boxes and a menu always open would make
          it tall enough to be the view rather than a strip over it. The count on the
          toggle is what makes it worth opening — or worth leaving shut.

          Against `tag.name`, not the name being typed above: a rule is written against a
          spelling that exists, and re-keying this on every keystroke in the name field
          would throw away a half-typed rule per character. */}
      {showRules && <TagRuleEditor tag={tag.name} />}

      {/* Drawn as what it is, like the post editor's. A tag is not only a row: deleting it
          takes it off every post carrying it, and that is the number worth reading before
          the button rather than after. Filled rather than outlined, and the way out sits
          where the hand was already going. */}
      {confirming && (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-[#ff5d5f] bg-[#ff5d5f]/5 p-3">
          <div>
            <h3 className="text-sm font-bold text-[#ff5d5f]">
              ⚠ Delete {tagLabel(tag.name)} for good
            </h3>
            <p className="mt-1 text-sm text-muted">
              It comes off{' '}
              <strong className="text-foreground">
                {tag.post_count} post{tag.post_count === 1 ? '' : 's'}
              </strong>{' '}
              and the tag itself is removed from the board. Any search or saved query naming it
              stops matching. <strong className="text-foreground">There is no undo.</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="min-h-9 rounded-lg bg-[#ff5d5f] px-4 text-sm font-semibold text-[#0d0f14] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-9 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-background"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}
