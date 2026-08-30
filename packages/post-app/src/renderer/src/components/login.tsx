import { useEffect, useState, type FormEvent } from 'react'

/**
 * The web's /login, in a window. Same account, same password, same message for either
 * half being wrong — there is no signup anywhere in this project, and this app is one
 * more thing an existing account can do.
 *
 * The session it creates is written to the app's encrypted store, so this screen is
 * shown once and then only when the refresh token finally expires. "Remember me" is for
 * that day: it keeps the email and password in the same store, so the form comes back
 * filled in instead of blank.
 */
export function Login({
  onSignedIn,
  onSettings,
}: {
  onSignedIn: () => void
  onSettings: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  // Filling the form is a read from the main process, not React state anyone owns, so
  // the answer sets state from the callback and a screen left before it arrives is
  // dropped. Typing beats a slow disk: a field already touched is not overwritten.
  useEffect(() => {
    let alive = true
    void window.api.readSavedLogin().then((saved) => {
      if (!alive || !saved) return
      setRemember(true)
      setEmail((current) => current || saved.email)
      setPassword((current) => current || saved.password)
    })
    return () => {
      alive = false
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    const result = await window.api.logIn(email, password, remember)
    setPending(false)
    if (result.ok) onSignedIn()
    else setError(result.error)
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <p className="text-base font-bold tracking-tight">Pubooru</p>
        <p className="text-xs text-muted">Uploader</p>
      </div>
      <h1 className="text-center text-2xl font-bold tracking-tight">Log in</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="size-4 accent-accent"
          />
          Remember me
        </label>
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-accent font-medium text-background disabled:opacity-50"
        >
          {pending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <button
        type="button"
        onClick={onSettings}
        className="text-center text-xs text-muted hover:text-foreground"
      >
        Connection settings
      </button>
    </div>
  )
}
