import { useEffect, useState, type FormEvent } from 'react'
import type { AppConfigInput } from '../../../shared/api'

const BLANK: AppConfigInput = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseServiceRoleKey: '',
  siteUrl: '',
}

/**
 * Where the app is told which board it uploads to. This is the desktop answer to the
 * web's `<SetupNotice />`: the same four values, except they are typed in once and kept
 * in the app's own encrypted store instead of coming from a `.env.local` that a packaged
 * app has no way to read.
 *
 * In a checkout this screen usually never appears — `main/config.ts` falls back to the
 * repo's `.env.local` during development, so `npm run dev` reaches the same project the
 * website does.
 */
export function Settings({
  encryptedAtRest,
  canCancel,
  onSaved,
  onCancel,
}: {
  encryptedAtRest: boolean
  canCancel: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<AppConfigInput>(BLANK)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  // Prefilled with whatever it was last saved as, so reopening this to fix one field
  // doesn't mean pasting all four again.
  useEffect(() => {
    void window.api.readConfig().then((stored) => stored && setValues(stored))
  }, [])

  const set = (key: keyof AppConfigInput) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    const result = await window.api.saveConfig(values)
    setPending(false)
    if (result.ok) onSaved()
    else setError(result.error)
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Connection settings</h1>
        <p className="mt-1 text-sm text-muted">
          Supabase dashboard → Project Settings → API. The same values the website reads
          from its <code className="font-mono text-xs">.env.local</code>.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Project URL"
          value={values.supabaseUrl}
          onChange={set('supabaseUrl')}
          placeholder="https://abcdefgh.supabase.co"
        />
        <Field
          label="Anon key"
          value={values.supabaseAnonKey}
          onChange={set('supabaseAnonKey')}
          placeholder="eyJhbGciOi…"
          hint="Signs you in and writes the post row, so the upload is recorded as yours."
        />
        <Field
          label="Service role key"
          value={values.supabaseServiceRoleKey}
          onChange={set('supabaseServiceRoleKey')}
          placeholder="eyJhbGciOi…"
          hint={
            'Writes the image files and the tag/rating counters — the rows no user ' +
            'session may set. It bypasses RLS entirely, so it stays on this machine.'
          }
        />
        <Field
          label="Site URL (optional)"
          value={values.siteUrl}
          onChange={set('siteUrl')}
          placeholder="https://booru.example.com"
          hint="Only used to open a finished post in your browser."
        />

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <p className="text-xs text-muted">
          {encryptedAtRest
            ? 'Saved to this app’s data folder, encrypted with your OS keystore.'
            : 'Your OS offered no keystore, so these are saved as plain text in this ' +
              'app’s data folder.'}
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 flex-1 rounded-lg bg-accent text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg border border-border px-4 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (event: { target: { value: string } }) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="min-h-11 rounded-lg border border-border bg-surface px-3 font-mono text-xs outline-none focus:border-accent"
      />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}
