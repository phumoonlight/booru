'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { NavProgress, NavProgressBar } from '@/components/nav-progress'
import { logout } from '@/lib/actions/auth'

/**
 * The signed-in corner of the header. The bar has no room to spell out every account
 * action, so the trigger only says who you are — 👤 plus the username — and the two
 * things you can do with the account sit in a popup under it.
 */
export function AccountMenu({ username }: { username: string }) {
  // Open is the page the menu was opened on, so arriving somewhere else closes it. The
  // alternative — closing on the click — unmounts the link while its navigation is
  // still out, and takes the pending bar with it.
  const pathname = usePathname()
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const open = openedOn === pathname
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null)
  const wrapper = useRef<HTMLDivElement>(null)

  // A dropdown that outlives the tap that started it reads as stuck, so anything
  // outside it — a click elsewhere, Escape — puts it away.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpenedOn(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenedOn(null)
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
        className="flex max-w-32 items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <span aria-hidden>👤</span>
        <span className="truncate">{username}</span>
      </button>

      {open && (
        // Right-aligned: the trigger is the last thing in the bar, so the panel grows
        // inward rather than off the edge of a phone screen.
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <Link
            href="/account"
            role="menuitem"
            className="flex min-h-11 items-center px-3 text-sm text-muted hover:bg-background hover:text-foreground"
          >
            ⚙️ Account
            <NavProgress />
          </Link>
          <form action={logout}>
            <LogoutButton />
          </form>
        </div>
      )}
    </div>
  )
}

/**
 * Log out signs out on the server and redirects, so like every other item here it has a
 * wait worth showing. `useFormStatus` only reads the form it sits inside, which is why
 * this is its own component.
 */
function LogoutButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      role="menuitem"
      className="flex min-h-11 w-full items-center px-3 text-left text-sm text-muted hover:bg-background hover:text-foreground"
    >
      👋 Log out
      {pending && <NavProgressBar />}
    </button>
  )
}
