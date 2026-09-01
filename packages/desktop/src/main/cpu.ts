import { availableParallelism, constants, setPriority } from 'node:os'
import sharp from 'sharp'
import type { EncodePriority } from '../shared/api'

/**
 * How much of the machine the encoder is allowed to take.
 *
 * An upload is a lossless AVIF plus a lossy thumbnail at effort 9, and libvips spreads a
 * single encode across every core it can see. On a 16-core desktop that is the whole CPU
 * pinned for the twenty seconds a large image takes, and everything else on the machine
 * stutters while it happens: a background chore behaving like a benchmark.
 *
 * Two knobs, and neither one is `effort`. Thread count and compression settings are
 * independent, so nothing here trades bytes for comfort. Measured on
 * `tests/static/example.jpg` at effort 9, one 16-core machine:
 *
 *   threads    wall   CPU-ms   avg cores   output
 *   16        18.5s     193k        10.5   598,972 B
 *   8         24.2s     153k         6.3   597,627 B
 *   4         37.9s     134k         3.5   595,930 B
 *   1        106.6s     106k         1.0   590,841 B
 *
 * Fewer threads came out *smaller*, not larger — aom cuts the frame into fewer tiles and
 * a tile edge is a place prediction starts over — and the 16-thread run spent 80k CPU-ms
 * on nothing but parallelism. What a lower number costs is wall time, and only that.
 */

/**
 * Cores as the OS will actually hand them over. `availableParallelism()` rather than
 * `cpus().length` because the two disagree wherever there is a CPU quota.
 */
export const CPU_COUNT = Math.max(1, availableParallelism())

/**
 * Half the machine: ~30% more wall time on the table above, and the other half left for
 * whatever the person is doing while the queue works. Anyone who wants the whole CPU can
 * say so in settings — the default is the one that interrupts nothing.
 */
export const DEFAULT_ENCODE_THREADS = Math.max(1, Math.floor(CPU_COUNT / 2))

/**
 * Whatever arrives — a number typed into settings, a `save.json` written before this
 * setting existed, junk from a hand edit — becomes a usable thread count.
 */
export function clampEncodeThreads(value: unknown): number {
  const threads = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(threads) || threads < 1) return DEFAULT_ENCODE_THREADS
  return Math.min(threads, CPU_COUNT)
}

/**
 * Sets libvips' thread pool, which is what both compressors, the staging previews and
 * every metadata read run on. Global to the process and re-appliable, so changing the
 * setting takes effect on the next image rather than the next launch.
 */
export function applyEncodeThreads(threads: unknown): void {
  sharp.concurrency(clampEncodeThreads(threads))
}

/**
 * The other half of the answer: not how many cores, but how hard the app argues for
 * them. Threads bound the work; priority decides who wins when something else wants the
 * machine at the same moment. Neither one is `effort`.
 */
const ENCODE_PRIORITIES = [
  'low',
  'below-normal',
  'normal',
] as const satisfies readonly EncodePriority[]

/**
 * Below normal by default: the scheduler hands a core to any normal-priority process
 * that asks and gives it straight back when nothing does, so an idle machine loses
 * nothing and a busy one stops stuttering. `low` is for encoding in the background of
 * something that matters more, `normal` for when the queue is the thing you are waiting
 * on and the machine is yours.
 */
export const DEFAULT_ENCODE_PRIORITY: EncodePriority = 'below-normal'

const PRIORITY_VALUES: Record<EncodePriority, number> = {
  low: constants.priority.PRIORITY_LOW,
  'below-normal': constants.priority.PRIORITY_BELOW_NORMAL,
  normal: constants.priority.PRIORITY_NORMAL,
}

export function clampEncodePriority(value: unknown): EncodePriority {
  return ENCODE_PRIORITIES.includes(value as EncodePriority)
    ? (value as EncodePriority)
    : DEFAULT_ENCODE_PRIORITY
}

/**
 * Sets the main process's scheduling priority — the whole process, because it does
 * nothing else expensive: IPC handlers, some Supabase calls, and the encoding. The
 * window is a separate renderer process at normal priority, so the UI does not sink
 * with it. Output bytes are identical at every setting: priority is when the work runs,
 * not what it computes.
 *
 * Lowering your own priority is always allowed; *raising* it back is not, on anything
 * POSIX — a process that has been niced down needs privileges to come back up, so
 * moving from low to normal there takes a restart. Windows, which is what this app is
 * packaged for, has no such rule. Either way the failure is logged and the setting is
 * still saved: the next launch reads it and starts where it was asked to.
 */
export function applyEncodePriority(priority: unknown): void {
  try {
    setPriority(0, PRIORITY_VALUES[clampEncodePriority(priority)])
  } catch (error) {
    console.error('Could not set process priority:', error instanceof Error ? error.message : error)
  }
}
