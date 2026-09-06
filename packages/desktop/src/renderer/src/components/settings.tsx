import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type {
  AppStatus,
  BrowserChoice,
  EncodePriority,
  PreferencesInput,
} from '../../../shared/api'
import { BUTTON_ON_SURFACE, BUTTON_SM } from './buttons'
import { reloadImplications } from '../implications'
import { reloadRecommendations } from '../recommendations'
import { reloadCatalogs } from '../catalogs'

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
 * Four things, and only three of them are settings.
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
 *
 * **Links** is where a post opens when you click through to the board. Left alone that is
 * whatever the OS would pick, which is the browser you live in — and a board is not always
 * something you want in that history. The list is what the Start menu would offer.
 *
 * **Tag cache** is a readout with a button under it. Nothing about it is configurable —
 * a day is a day — but a cache is the one thing in the app that can be wrong while
 * everything else is right, so there is a way to throw it away without hunting for the
 * file.
 */
export function Settings({ status, onChanged }: { status: AppStatus; onChanged: () => void }) {
  // Seeded from what the main process is actually running with, which is also what it
  // answers with after a save — so the screen never shows a value that was refused.
  const [values, setValues] = useState<PreferencesInput>({
    encodeThreads: status.cpu.threads,
    encodePriority: status.cpu.priority,
    browser: status.browser.chosen,
  })
  const [editingThreads, setEditingThreads] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [transferred, setTransferred] = useState<{ ok: boolean; text: string } | null>(null)

  /**
   * Export or import `save.json`. Both open their picker on the main side, so there is
   * nothing to pass and nothing to validate here.
   *
   * A dismissed picker says nothing at all — it is the answer to a question you asked and
   * then withdrew, and a line reporting it is a line to dismiss in turn.
   *
   * An import replaces sections of a file three things in this window are holding a copy
   * of: the two rule stores and the catalogs, which read once per launch, and the
   * preference fields above, seeded from what main is running with. All of them are
   * re-read rather than left to disagree with the file until the next restart.
   */
  async function transfer(direction: 'export' | 'import') {
    setTransferring(true)
    setTransferred(null)
    const result =
      direction === 'export' ? await window.api.exportSettings() : await window.api.importSettings()
    setTransferring(false)

    if (!result.ok && 'cancelled' in result) return
    if (!result.ok) {
      setTransferred({ ok: false, text: result.error })
      return
    }

    if (direction === 'import') {
      await Promise.all([reloadImplications(), reloadRecommendations(), reloadCatalogs()])
      // Re-seeded from what main is now running with, exactly as `useState` seeded it —
      // `onChanged` refreshes the status App holds, but these fields are state and would
      // otherwise keep showing the numbers from before the import until a restart.
      const next = await window.api.getStatus()
      setValues({
        encodeThreads: next.cpu.threads,
        encodePriority: next.cpu.priority,
        browser: next.browser.chosen,
      })
      onChanged()
    }
    setTransferred({ ok: true, text: result.message })
  }

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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pt-8 pb-25">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🔌</span>
            Connection
          </h1>
          <p className="mt-1 text-sm text-muted">
            Set when this copy was built, and not editable here. To point at another board, build
            the app again with that project&rsquo;s values in the repo&rsquo;s environment file.
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

        {/* Everything you can do to `save.json` as a file, in one row. The folder is a
            path nobody would guess, which is the whole reason the other two exist: moving
            settings to a laptop, or keeping a copy of a few hundred tag rules before
            trying something, was four steps through a folder you had to be shown. */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => void transfer('export')}
            disabled={transferring}
            title="Write preferences, tag rules and catalogs to a file you choose"
            className={BUTTON_SM}
          >
            <span aria-hidden>📤</span> Export settings
          </button>
          <button
            type="button"
            onClick={() => void transfer('import')}
            disabled={transferring}
            title="Read preferences, tag rules and catalogs back from a file"
            className={BUTTON_SM}
          >
            <span aria-hidden>📥</span> Import settings
          </button>
          <button
            type="button"
            onClick={() => void window.api.openDataFolder()}
            className={BUTTON_SM}
          >
            <span aria-hidden>📁</span> Open data folder
          </button>
        </div>

        {/* Nothing in the file is secret — the service-role key is compiled into the
            bundle, not stored — and that is worth saying, since a file called "settings"
            from an app that writes to a database sounds like it should not leave. */}
        <p className="text-xs text-muted">
          Preferences, both sets of tag rules and your tag catalogs, as plain JSON. Nothing
          secret is in it: the board’s keys are compiled into the app, not saved here. An
          import takes only the sections the file has, and leaves the rest alone.
        </p>
        {transferred && (
          <p className={`text-sm ${transferred.ok ? 'text-muted' : 'text-[#ff5d5f]'}`}>
            {transferred.text}
          </p>
        )}
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

      {/* Where a link leaves for. Not about the board and not about the encoder, which is
          why it is its own section rather than a row in either. */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🌐</span>
            Links
          </h2>
          <p className="mt-1 text-sm text-muted">
            Opening a post, a tag or the board itself hands the address to a browser. Pick which
            one, or leave it to the system.
          </p>
        </div>

        <BrowserPicker
          value={values.browser}
          options={status.browser.options}
          onChange={(next) => void save({ browser: next })}
        />
      </div>

      {/* Not a setting — a readout and an escape hatch. */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🗂️</span>
            Tag cache
          </h2>
          <p className="mt-1 text-sm text-muted">
            The board&rsquo;s tag list, kept for a day so typing a tag doesn&rsquo;t ask the
            server on every keystroke. It refreshes itself when it expires, and it is dropped
            the moment an upload finishes — a new post is what makes it wrong.
          </p>
        </div>

        <Readout
          label="Held"
          value={
            status.tagCache.at === null
              ? ''
              : `${status.tagCache.count} tags, read ${new Date(status.tagCache.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
          }
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void window.api.clearTagCache().then(onChanged)}
            disabled={status.tagCache.at === null}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium hover:border-accent disabled:opacity-50"
          >
            Clear cache
          </button>
          <span className="text-xs text-muted">
            Nothing is lost — the next tag you type reads the board again.
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * A row per browser rather than the segmented `Choice`: names are long, there can be five
 * of them, and the list is whatever this machine happens to have — a control sized for
 * three fixed options would be unreadable at four real ones.
 *
 * Only installed browsers are offered, because only those can be launched: the choice is
 * checked against the same list when a link is opened, so an option that isn't here would
 * silently fall back to the system anyway. Detection is Windows-only, so elsewhere this is
 * the one row.
 */
function BrowserPicker({
  value,
  options,
  onChange,
}: {
  value: string
  options: BrowserChoice[]
  onChange: (next: string) => void
}) {
  const fallback = options.find((option) => option.isDefault)
  const rows = [
    { path: '', name: fallback ? `System default (${fallback.name})` : 'System default' },
    ...options,
  ]

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      Open links in
      <div role="radiogroup" aria-label="Open links in" className="flex flex-col gap-1">
        {rows.map((row) => {
          const selected = row.path === value
          return (
            <button
              key={row.path || 'system'}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(row.path)}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm transition-colors ${
                selected
                  ? 'border-accent bg-accent/10 text-foreground'
                  : 'border-border bg-surface text-muted hover:border-accent hover:text-foreground'
              }`}
            >
              <span aria-hidden className={selected ? 'text-accent' : 'text-muted'}>
                {selected ? '◉' : '○'}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
            </button>
          )
        })}
      </div>
      <span className="text-xs text-muted">
        {options.length === 0
          ? 'No installed browsers were found, so links go wherever the system sends them.'
          : 'A browser that has been uninstalled since falls back to the system default.'}
      </span>
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
            className={`${BUTTON_ON_SURFACE} whitespace-nowrap`}
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
        className={BUTTON_ON_SURFACE}
      >
        Cancel
      </button>
      <button
        type="submit"
        className={`${BUTTON_ON_SURFACE} whitespace-nowrap`}
      >
        <span aria-hidden>💾</span> Save
      </button>
    </form>
  )
}
