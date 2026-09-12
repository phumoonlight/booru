import {
  TAG_CATEGORIES,
  categoryColor,
  categoryLabel,
  formSectionLabel,
  type TagCategory,
} from '@common/tags'
import { FIELD } from './panel'
import type { FormSection } from '@common/data/form-sections'

/**
 * The category, as the menu both forms use.
 *
 * A menu rather than free text: `tags.category` is free-form in the database, but the
 * list it is drawn from is what gives a category its colour and its place in the order,
 * and a category with neither is a row nobody can find. Adding one is a line in
 * `TAG_CATEGORIES` and a colour beside it, which is the change that makes it real
 * everywhere — the website's /tags included — rather than only in this window.
 */
export function CategoryField({
  value,
  onChange,
  disabled = false,
}: {
  value: TagCategory
  onChange: (next: TagCategory) => void
  disabled?: boolean
}) {
  return (
    // Coloured closed and open, the way the rating select is: the colour is how a category
    // is recognised everywhere else on this screen — the tag rows, the section headings,
    // the chips on a post — so the one place you *choose* one was the only place it was
    // just a word.
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={`${FIELD} ${categoryColor(value)}`}
    >
      {TAG_CATEGORIES.map((option) => (
        <option key={option} value={option} className={`bg-background ${categoryColor(option)}`}>
          {categoryLabel(option)}
        </option>
      ))}
    </select>
  )
}

/**
 * Which row of the desktop tag form a tag is offered on — `tags.form_section_id`, whose
 * migration has why it is an id.
 *
 * A menu, and it has been three things now. A fixed list in code was wrong because how a
 * form wants dividing is a judgement about one board's own vocabulary. Free text with a
 * datalist was right about that and wrong about everything else: no order, no row until a
 * tag was already on it, and a near-duplicate the first time somebody typed `hair colour`.
 * The sections are rows on the board now, made and ordered on the 🧱 Sections panel, so this
 * is a menu again — and this time the list it offers is one you wrote.
 *
 * **Every row, whatever the tag's category is.** They were the rows of that category alone
 * while a section belonged to one, which is exactly the constraint that went: `bikini` is
 * General and belongs on the swimsuit row beside Appearance tags.
 *
 * Empty means no row at all, which is not the same as harmless: a tag on no section is not
 * offered anywhere in the form. That is the point of it — an unfiled tag is one the
 * vocabulary has not decided about — and it is why this menu says so rather than saying
 * "none".
 *
 * Absent entirely on a board with no sections, rather than drawn empty: a menu whose only
 * option is "nowhere" is a control that cannot do anything, and its absence says the same
 * more quietly.
 */
export function SectionField({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: number | null
  onChange: (next: number | null) => void
  options: FormSection[]
  disabled?: boolean
}) {
  if (options.length === 0) return null

  return (
    <select
      value={options.some((section) => section.id === value) ? String(value) : ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      disabled={disabled}
      className={`${FIELD} min-w-32 flex-1`}
    >
      <option value="">On no row — not offered</option>
      {options.map((section) => (
        <option key={section.id} value={section.id}>
          {formSectionLabel(section.name)}
        </option>
      ))}
    </select>
  )
}

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
