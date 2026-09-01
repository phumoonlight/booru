import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AppStatus, EncodePriority, PreferencesInput } from '../../../shared/api'

/**
 * Spelled out here rather than imported from `main/cpu.ts`, which owns the behaviour:
 * that module pulls in sharp, and nothing the renderer imports may. The union comes
 * from `shared/api.ts`, so dropping or renaming a tier breaks this list at build time.
 */
const PRIORITIES: { value: EncodePriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'below-normal', label: 'Below normal' },
  { value: 'normal', label: 'Normal' },
]

/**
 * Two things, and only one of them is a setting.
 *
 * **Connection** is a readout. Which board this copy uploads to was decided when it was
 * built — the project URL, both keys and the site address are compiled into the bundle
 * from the repo's environment file, and the build refuses to produce an installer
 * without all four (`electron.vite.config.ts`). It used to be four boxes typed in on
 * first launch, which meant every machine running the app kept a service-role key in a
 * file the app itself wrote, and the only way to know which project a copy pointed at
 * was to come here and read it. Now a build *is* the answer, and this panel says so.
 * The keys are not shown: they are not editable, and a value nobody can act on is worth
 * less than the risk of it being on screen.
 *
 * **Compression** is the real settings, and they are about this machine rather than the
 * board: how many cores an upload may take and how hard it argues for them.
 */
export function Settings({ status, onChanged }: { status: AppStatus; onChanged: () => void }) {
  // Seeded from what the main process is actually running with, which is also what it
  // answers with after a save — so the screen never shows a value that was refused.
  const [values, setValues] = useState<PreferencesInput>({
    encodeThreads: status.cpu.threads,
    encodePriority: status.cpu.priority,
  })
  const [editingThreads, setEditingThreads] = useState(false)

  async function save(patch: Partial<PreferencesInput>) {
    const updated = { ...values, ...patch }
    setValues(updated)
    setEditingThreads(false)
    setValues(await window.api.savePreferences(updated))
    onChanged()
  }

  /**
   * The one row that is typed. Anything unreadable leaves the setting where it was — a
   * cleared box is a slip, not a request for zero threads — and the number is bounded
   * here as well as in `main/cpu.ts`, so the row never shows a count the machine cannot
   * deliver.
   */
  function saveThreads(next: string) {
    const typed = Number.parseInt(next, 10)
    if (!Number.isFinite(typed)) {
      setEditingThreads(false)
      return
    }
    void save({ encodeThreads: Math.min(Math.max(typed, 1), status.cpu.count) })
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🔌</span>
            Connection
          </h1>
          <p className="mt-1 text-sm text-muted">
            Set when this copy was built, and not editable here. To point at another board, build
            the app again with that project's values in the repo's environment file.
          </p>
        </div>

        {status.configured ? (
          <>
            <Readout label="Project" value={status.supabaseUrl} />
            <Readout label="Board" value={status.siteUrl} />
            <p className="text-xs text-muted">
              The anon and service role keys are compiled in with these. They are not shown, and
              nothing writes them to disk.
            </p>
          </>
        ) : (
          // The build refuses to produce this, so it is a bundle put together some other
          // way — worth a sentence that says what is wrong rather than a Supabase error
          // from the first thing that tries to use it.
          <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
            This build has no project baked into it, so there is nothing to upload to. Rebuild it
            with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
            and NEXT_PUBLIC_SITE_URL set.
          </p>
        )}

        <div className="flex">
          {/* The folder is a path nobody would guess. The file holds the session and the
              two settings below it — no keys, not any more. */}
          <button
            type="button"
            onClick={() => void window.api.openDataFolder()}
            className="min-h-9 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            <span aria-hidden>📁</span> Open data folder
          </button>
        </div>
      </div>

      {/* How hard this machine works while the queue runs — the only thing on this screen
          anyone can change, and the only thing about the computer rather than the board. */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🧵</span>
            Compression
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every upload is re-encoded here, which is the whole point of the desktop app — and left
            alone, that takes the entire CPU for as long as it runs.
          </p>
        </div>

        <Field
          label="Encoder threads"
          placeholder={String(status.cpu.count)}
          display={`${values.encodeThreads} of ${status.cpu.count} cores`}
          hint={
            'Compression itself is unchanged: fewer threads is the same quality at the same ' +
            'settings, only slower — and a shade smaller.'
          }
          value={String(values.encodeThreads)}
          editing={editingThreads}
          onEdit={() => setEditingThreads(true)}
          onSave={saveThreads}
          onCancel={() => setEditingThreads(false)}
        />

        <Choice
          label="Priority"
          value={values.encodePriority}
          options={PRIORITIES}
          onChange={(next) => void save({ encodePriority: next })}
          hint={
            'How hard the app argues for those cores. Below normal gives them up the moment ' +
            'something else asks and takes them back when nothing does; normal makes the ' +
            'queue compete like anything else you are running.'
          }
        />
      </div>
    </div>
  )
}

/** Something the app knows and you cannot change — same row, without the Edit. */
function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label}
      <div className="flex min-h-11 items-center rounded-lg border border-border bg-surface px-3">
        <span className={`min-w-0 flex-1 truncate font-mono text-xs ${value ? '' : 'text-muted'}`}>
          {value || 'Not set'}
        </span>
      </div>
    </div>
  )
}

/**
 * A setting with three answers rather than a value to type. No Edit step: the options
 * are already on screen, so an extra click to reveal what you can pick would buy the
 * protection a long typed value needs and this one does not.
 */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label}
      <div
        role="radiogroup"
        aria-label={label}
        className="flex min-h-11 items-center gap-1 rounded-lg border border-border bg-surface p-1"
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-9 flex-1 rounded-md px-2 text-xs transition-colors ${
                selected
                  ? 'bg-accent text-background'
                  : 'text-muted hover:bg-background hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

/**
 * A setting, shown. Edit swaps the row for the editor below, which is its own component
 * so it mounts with the current value as its draft and takes it away again on Cancel —
 * there is nowhere for a half-typed value to linger.
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
  display,
}: {
  label: string
  value: string
  editing: boolean
  onEdit: () => void
  onSave: (next: string) => void
  onCancel: () => void
  placeholder?: string
  hint?: string
  /** What the row shows when it isn't being edited, if that differs from what you type
   *  into it — a thread count reads better as "6 of 16 cores" than as a bare 6. */
  display?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label}
      {editing ? (
        <Editor value={value} onSave={onSave} onCancel={onCancel} placeholder={placeholder} />
      ) : (
        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3">
          <span
            className={`min-w-0 flex-1 truncate font-mono text-xs ${value ? '' : 'text-muted'}`}
          >
            {display ?? (value || 'Not set')}
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
