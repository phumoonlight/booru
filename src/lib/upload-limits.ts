// Upload size ceilings, in one place because three layers have to agree on them:
// the queue (rejects a file before it is staged), the upload action (rejects it
// again server-side), and `serverActions.bodySizeLimit` in next.config.ts, which
// is enforced by the framework *before* the action runs — a file over that limit
// fails as a framework error with no result the UI can show against the row.
//
// 4MB, not more: on Vercel a serverless request body is capped at 4.5MB whatever
// Next is configured to allow, so anything larger would pass every check here and
// still 413 in production. Lifting it means moving uploads off server actions and
// onto signed upload URLs straight to Supabase (docs/architecture.md).
export const MAX_FILE_SIZE = 4 * 1024 * 1024

export const MAX_FILE_SIZE_LABEL = `${MAX_FILE_SIZE / 1024 / 1024}MB`
