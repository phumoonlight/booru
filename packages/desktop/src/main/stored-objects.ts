import type { ObjectStore } from '@common/storage'
import { logActivity } from './activity-log'

/**
 * Removes the stored objects a deleted row pointed at, after that row is gone.
 *
 * The delete that was asked for has already happened by the time this runs, so a failure
 * here does not turn it into a failed delete — the caller still answers `ok`. What it does
 * do is say so: an error entry in the log, which the window raises as a notice, naming every
 * path left in the bucket. Those objects are orphans nothing on the board can name any more,
 * and this entry is the only place their paths are written down.
 */
export async function removeStoredObjects(
  store: ObjectStore | null,
  paths: string[],
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  if (paths.length === 0) return
  if (!store) {
    logActivity({
      level: 'error',
      action,
      message: 'The row was deleted, but no bucket is configured — its stored objects remain.',
      detail: { ...detail, orphaned: paths },
    })
    return
  }

  const results = await Promise.allSettled(paths.map((path) => store.remove(path)))
  const failed = results.flatMap((result, at) =>
    result.status === 'rejected'
      ? [
          {
            path: paths[at],
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
        ]
      : []
  )
  if (failed.length === 0) {
    logActivity({ level: 'info', action: `${action}:storage`, message: 'ok', detail: { paths } })
    return
  }

  logActivity({
    level: 'error',
    action: `${action}:storage`,
    message: `The row was deleted, but ${failed.length} of ${paths.length} stored objects could not be removed: ${failed[0].error}`,
    detail: { ...detail, failed },
  })
}
