import 'server-only'
import { getCurrentProfile, type Profile } from '@/lib/data/profiles'

/**
 * Call at the top of every mutating server action / page.
 * Never trust the proxy guard alone.
 */
export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) {
    throw new Error('Unauthorized: sign in required')
  }
  return profile
}
