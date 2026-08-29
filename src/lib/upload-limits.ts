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

// A small file can still decode enormous: a flat 12000x12000 PNG compresses to
// ~400KB, sails past the byte cap, and expands to 412MB in memory. Bytes bound
// the upload, pixels bound the decode.
//
// 20MP is a time budget as much as a memory one. Lossless AVIF costs roughly
// 0.17s per megapixel, so a 49MP upload — still only 375KB, still legal under
// every other limit — spent 9.9s in the pipeline and lost to the 10s function
// timeout after doing all the work. 20MP holds the whole pipeline near 3.5s, and
// is still far above anything real: a 2000x3000 illustration is 6MP, a 4000x3000
// photo 12MP.
export const MAX_PIXELS = 20_000_000

/**
 * What the web hands `createPostFromImage`. The desktop uploader passes its own
 * (`packages/post-app/src/main/limits.ts`) — both numbers above are Vercel's, not
 * the pipeline's, and a local CPU is bound by neither.
 */
export const WEB_UPLOAD_LIMITS = {
  maxFileSize: MAX_FILE_SIZE,
  maxFileSizeLabel: MAX_FILE_SIZE_LABEL,
  maxPixels: MAX_PIXELS,
}
