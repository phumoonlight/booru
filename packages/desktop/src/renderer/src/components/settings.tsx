import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AppConfigInput } from '../../../shared/api'

const BLANK: AppConfigInput = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseServiceRoleKey: '',
  siteUrl: '',
}

/**
 * Straight to the page the three values are on, once the project URL says which project
 * that is — a hosted project's ref is its subdomain. Anything else, a self-hosted URL or
 * an empty box, gets the dashboard's front door.
 */
function dashboardUrl(supabaseUrl: string): string {
  const ref = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)\/?$/i.exec(supabaseUrl.trim())?.[1]
  return ref ? `https://supabase.com/dashboard/project/${ref}` : 'https://supabase.com/dashboard'
}

/**
 * Where the app is told which board it uploads to. This is the desktop answer to the
 * web's `<SetupNotice />`: the same four values, except they are typed in once and kept
 * in the app's own `save.json` instead of coming from a `.env.local` that a packaged app
 * has no way to read.
 *
 * It is the only way in, in a checkout as much as in an installed copy. Development used
 * to read the website's `.env.local` instead, which meant this screen — the one every
 * real user meets first — was the path nobody ever ran.
 *
 * It reads as four settings rather than as a form: each one shows what it is set to, and
 * Edit turns that row into a box with its own Save. Pasting four values once and then
 * coming back to fix a single key is what actually happens here, and a screenful of open
 * inputs invites re-pasting all of them — or losing one to a stray keystroke in a field
 * nobody meant to be editing.
 */
export function Settings({ onChanged }: { onChanged: () => void }) {
  const [values, setValues] = useState<AppConfigInput>(BLANK)
  const [editing, setEditing] = useState<keyof AppConfigInput | null>(null)
  const [error, setError] = useState('')
  // What is on disk, so saving a row nobody changed doesn't write the file again.
  const [stored, setStored] = useState('')

  // Prefilled with whatever it was last saved as, so reopening this to fix one field
  // doesn't mean pasting all four again.
  useEffect(() => {
    void window.api.readConfig().then((found) => {
      if (!found) return
      setValues(found)
      setStored(JSON.stringify(found))
    })
  }, [])

  /**
   * One row's Save. The file holds all four values, so every row writes the whole config
   * — which is why the main process can refuse it while the required three are still
   * incomplete. That refusal is the honest answer to setting the first of four, so it is
   * reported in muted text until all three are filled and the complaint is a real one.
   *
   * The typed value is kept either way: a row that saved nothing still shows what you put
   * in it, and the line under the fields says it has not been written.
   */
  async function save(key: keyof AppConfigInput, next: string) {
    const updated = { ...values, [key]: next }
    setValues(updated)
    setEditing(null)

    const snapshot = JSON.stringify(updated)
    if (snapshot === stored) return

    const result = await window.api.saveConfig(updated)
    if (!result.ok) {
      setError(result.error)
      return
    }

    setStored(snapshot)
    setError('')
    onChanged()
  }

  const required = Boolean(
    values.supabaseUrl && values.supabaseAnonKey && values.supabaseServiceRoleKey
  )

  const row = (key: keyof AppConfigInput) => ({
    value: values[key],
    editing: editing === key,
    onEdit: () => setEditing(key),
    onSave: (next: string) => void save(key, next),
    onCancel: () => setEditing(null),
  })

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
      <div>
        <h1 className="flex gap-1 text-lg font-bold tracking-tight">
          <span aria-hidden>⚙️</span>
          Connection settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Which board this app uploads to. The URL and both keys are in the Supabase dashboard,
          under Project Settings → API.
        </p>
        <button
          type="button"
          onClick={() => void window.api.openExternal(dashboardUrl(values.supabaseUrl))}
          className="mt-2 min-h-9 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          <span aria-hidden>🔗</span> Open Supabase dashboard
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <Field
          label="Project URL"
          placeholder="https://abcdefgh.supabase.co"
          {...row('supabaseUrl')}
        />
        <Field
          label="Anon key"
          placeholder="eyJhbGciOi…"
          hint="Signs you in and writes the post row, so the upload is recorded as yours."
          {...row('supabaseAnonKey')}
        />
        <Field
          label="Service role key"
          placeholder="eyJhbGciOi…"
          hint={
            'Writes the image files and the tag/rating counters — the rows no user ' +
            'session may set. It bypasses RLS entirely, so it stays on this machine.'
          }
          {...row('supabaseServiceRoleKey')}
        />
        <Field
          label="Site URL (optional)"
          placeholder="https://booru.example.com"
          hint="Only used to open a finished post in your browser."
          {...row('siteUrl')}
        />

        {error &&
          (required ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          ) : (
            <p className="text-sm text-muted">{error}</p>
          ))}

        <div className="flex">
          {/* The folder is a path nobody would guess; the file is selected rather than
              opened, since opening it puts a screenful of keys in front of whoever is
              looking. */}
          <button
            type="button"
            onClick={() => void window.api.openConfigFolder()}
            className="min-h-9 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            <span aria-hidden>📁</span> Open config folder
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * A setting, shown. Edit swaps the row for the editor below, which is its own component
 * so it mounts with the current value as its draft and takes it away again on Cancel —
 * there is nowhere for a half-typed key to linger.
 */
function Field({
  label,
  value,
  editing,
  onEdit,
  onSave,
  onCancel,
  placeholder,
  hint,
}: {
  label: string
  value: string
  editing: boolean
  onEdit: () => void
  onSave: (next: string) => void
  onCancel: () => void
  placeholder?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label}
      {editing ? (
        <Editor value={value} onSave={onSave} onCancel={onCancel} placeholder={placeholder} />
      ) : (
        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3">
          {/* Truncated rather than wrapped: a key is 200-odd characters nobody reads, and
              a row four lines tall buries the settings under it. */}
          <span
            className={`min-w-0 flex-1 truncate font-mono text-xs ${value ? '' : 'text-muted'}`}
          >
            {value || 'Not set'}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="min-h-8 shrink-0 whitespace-nowrap text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            <span aria-hidden>✏️</span> {value ? 'Edit' : 'Set'}
          </button>
        </div>
      )}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

function Editor({
  value,
  onSave,
  onCancel,
  placeholder,
}: {
  value: string
  onSave: (next: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave(draft)
  }

  // Escape is the way out. Blur deliberately is not: reaching Save means clicking away
  // from the input, and a cancel on blur would take the edit with it on the way there.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') onCancel()
  }

  return (
    <form
      onSubmit={submit}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-accent bg-surface px-3"
    >
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
      />
      <button
        type="button"
        onClick={onCancel}
        className="min-h-8 shrink-0 px-1 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="min-h-8 shrink-0 whitespace-nowrap text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
      >
        <span aria-hidden>💾</span> Save
      </button>
    </form>
  )
}
