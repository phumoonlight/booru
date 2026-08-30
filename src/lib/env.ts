/**
 * True once .env.local holds real Supabase credentials.
 * Pages use this to show the setup notice instead of failing opaquely.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return Boolean(url && key && !url.includes('YOUR_PROJECT_REF') && !key.startsWith('YOUR_'))
}
