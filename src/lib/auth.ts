import 'server-only'
import { getCurrentProfile, type Profile } from '@/lib/data/profiles'

/**
 * Call at the top of every admin server action / admin page.
 * Never trust the proxy guard alone.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') {
    throw new Error('Unauthorized: admin only')
  }
  return profile
}
