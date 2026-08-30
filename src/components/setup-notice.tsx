/** Shown instead of data when Supabase credentials are missing. */
export function SetupNotice() {
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-6 text-center text-sm text-yellow-400">
      <p className="font-medium">Supabase is not configured</p>
      <p className="mt-1 text-yellow-400/80">
        Add the project URL, the anon key and the service role key to{' '}
        <code>.env.local</code>, then <code>npm run db:push</code>.
      </p>
    </div>
  )
}
