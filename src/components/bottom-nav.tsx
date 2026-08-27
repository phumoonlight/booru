import Link from 'next/link'
import { getCurrentProfile } from '@/lib/data/profiles'
import { logout } from '@/lib/actions/auth'
import { isSupabaseConfigured } from '@/lib/env'

const ITEM = 'flex min-h-14 w-full items-center justify-center text-sm text-muted hover:text-foreground'

/**
 * Mobile-first tab bar. Neither uploading nor moderating has a page of its own —
 * uploads are a drop zone on the posts page, edit/delete live in each post's Manage
 * section — so the only account action left is signing out.
 */
export async function BottomNav() {
  const profile = isSupabaseConfigured() ? await getCurrentProfile() : null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        <li className="flex-1">
          <Link href="/" className={ITEM}>
            Posts
          </Link>
        </li>
        <li className="flex-1">
          {profile ? (
            <form action={logout}>
              <button type="submit" className={ITEM}>
                Log out
              </button>
            </form>
          ) : (
            <Link href="/login" className={ITEM}>
              Log in
            </Link>
          )}
        </li>
      </ul>
    </nav>
  )
}
