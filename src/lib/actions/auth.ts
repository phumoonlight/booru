'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export type AuthFormState = { error: string } | null

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    return { error: 'Invalid email or password' }
  }

  revalidatePath('/', 'layout')
  redirect('/posts')
}

export async function logout() {
  const supabase = await createClient()
  // Local scope: the default is 'global', which revokes every refresh token the account
  // holds — signing out of this browser would sign out the desktop uploader, and any
  // other browser, along with it. Logging out of one place means one place.
  await supabase.auth.signOut({ scope: 'local' })
  revalidatePath('/', 'layout')
  // Back to the gallery, not to /login: signing out is not a reason to be asked to
  // sign in again, and everything on the board is public anyway.
  redirect('/posts')
}

const usernameSchema = z.object({
  // Same charset the handle_new_user trigger builds its default from, so a name typed
  // here and a name derived from an email address can never be told apart later
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username needs at least 3 characters')
    .max(32, 'Username can be at most 32 characters')
    .regex(/^[a-z0-9_.-]+$/, 'Use letters, numbers, and _ . - only'),
})

export type UsernameState =
  | { error: string; username?: never }
  | { username: string; error?: never }
  | null

/**
 * Rename the signed-in user. `username` is the only column `authenticated` may update
 * (the grant in the RLS migration withholds `role`), so the write needs no extra guard
 * beyond the session — but requireUser() still runs first to fail loudly rather than
 * silently updating zero rows.
 */
export async function updateUsername(
  _prevState: UsernameState,
  formData: FormData
): Promise<UsernameState> {
  const profile = await requireUser()

  const parsed = usernameSchema.safeParse({ username: formData.get('username') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const { username } = parsed.data
  if (username === profile.username) {
    return { username }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ username }).eq('id', profile.id)
  if (error) {
    // 23505 = unique_violation on profiles.username — the one failure a user can fix
    if (error.code === '23505') return { error: 'That username is taken' }
    return { error: `Save failed: ${error.message}` }
  }

  // The name rides in the header on every page
  revalidatePath('/', 'layout')
  return { username }
}
