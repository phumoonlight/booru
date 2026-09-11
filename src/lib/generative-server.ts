import 'server-only'
import { cookies } from 'next/headers'
import { GENERATIVE_COOKIE, GENERATIVE_COOKIE_VALUE } from '@/lib/generative'

/**
 * The reading half of the AI-board preference — split from `lib/generative.ts` for the
 * reason `lib/nsfw-server.ts` is split from `lib/nsfw.ts`: the checkbox that writes the
 * cookie is a client component, and `next/headers` anywhere in its import graph is a
 * build error however unreachable the call is.
 */
export async function isGenerativeEnabled(): Promise<boolean> {
  const store = await cookies()
  return store.get(GENERATIVE_COOKIE)?.value === GENERATIVE_COOKIE_VALUE
}
