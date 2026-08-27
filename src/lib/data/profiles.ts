import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type Profile = {
  id: string
  username: string
  created_at: string
}

/** Profile of the signed-in user, or null when anonymous. Cached per request —
 *  a page, its metadata and the bottom nav all ask the same question. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, username, created_at')
    .eq('id', user.id)
    .single()
  return data
})
