import { useEffect, useRef, useState } from 'react'

/**
 * The signed-in corner of the header, the same shape as the web's `<AccountMenu />`:
 * the trigger only says who you are — 👤 plus the username — and what you can do with
 * the account sits in a popup under it.
 *
 * Account has no screen here. This app is the upload page and nothing else, so the item
 * opens the board's own /account in the real browser — the settings gear beside it is
 * the only thing the window itself configures. Without a site URL in settings there is
 * nowhere to send it, so the item is simply absent, the way `PostLink` stops being a
 * link.
 */
export function AccountMenu({
  username,
  siteUrl,
  onLogOut,
}: {
  username: string
  siteUrl: string
  onLogOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  // A dropdown that outlives the click that started it reads as stuck, so anything
  // outside it — a click elsewhere, Escape — puts it away.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex max-w-32 items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <span aria-hidden>👤</span>
        <span className="truncate">{username}</span>
      </button>

      {open && (
        // Right-aligned: the trigger sits at the end of the bar, so the panel grows
        // inward rather than off the edge of a narrow window.
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {siteUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void window.api.openExternal(`${siteUrl}/account`)
              }}
              className="flex min-h-11 w-full items-center px-3 text-left text-sm text-muted hover:bg-background hover:text-foreground"
            >
              ⚙️ Account
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogOut()
            }}
            className="flex min-h-11 w-full items-center px-3 text-left text-sm text-muted hover:bg-background hover:text-foreground"
          >
            👋 Log out
          </button>
        </div>
      )}
    </div>
  )
}
