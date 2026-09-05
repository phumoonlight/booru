/**
 * Sweeps the AVIF `effort` setting through both encoders over tests/bench/example.jpg and
 * prints what each level actually buys.
 *
 * The point is the trade it measures, not the absolute numbers: effort is encode time
 * spent searching for a smaller file, and past some level the search stops finding
 * anything. Where that level sits depends on the input — flat line art keeps paying off
 * much further down than a photo does — so swap example.jpg for whatever content this
 * site actually gets before trusting the answer. A synthetic gradient will tell you
 * effort 3 is free and it is not.
 *
 * **Both encoders are lossy (quality 50), so bytes are not what effort optimizes.**
 * libaom targets a quantizer and its search minimizes `D + λR` — a joint cost — so a
 * slower encode spends bits it judges worth spending. Measured on the sample here, the
 * post image goes 27.1dB at effort 0 to 35.1dB at effort 9, and the bytes rise with it.
 * A row of this table is therefore not the same file at a different price; it is a
 * different file. Read the times, and treat the sizes as "what this fidelity costs",
 * not as a size search with a knee in it.
 *
 * (An earlier version of this comment said the post encoder was lossless. It was not,
 * and neither was the docstring it was reading. Hence the reminder.)
 *
 * The two are still swept separately: the post image is the whole frame and the
 * thumbnail a couple of hundred kilopixels, so the same effort level costs wildly
 * different time.
 *
 *   npm run bench:avif
 *
 * Node runs the file directly (type stripping, 22.6+). `.mts` rather than `.ts` because
 * package.json has no `"type": "module"`, and adding one to satisfy a bench script would
 * change how every other file in the repo is parsed. Imports have to be relative and carry
 * the extension — the `@/` alias is a bundler thing and nothing resolves it here.
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import { compressImgForPost } from '../../packages/common/src/imgcmp/for-post.ts'
import {
  compressImgForThumbnail,
  THUMB_MAX_HEIGHT,
  THUMB_MAX_WIDTH,
} from '../../packages/common/src/imgcmp/for-thumbnail.ts'

const FILE = 'example2.avif'
const SAMPLE = `tests/bench/${FILE}`
const EFFORTS = [9, 8, 7, 6, 5, 4]

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}kB`
const signedPct = (candidate: number, baseline: number) => {
  if (baseline === 0) return 'n/a'
  const delta = ((candidate - baseline) / baseline) * 100
  if (Math.abs(delta) < 0.05) return '±0.0%'
  return `${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)}%`
}

type Row = { effort: number; bytes: number; ms: number; message: string; buffer?: Buffer }

/**
 * The cheapest effort still within 1% of the baseline's size. That tolerance is
 * deliberate slack — a 0.5% larger file is not worth 4x the encode time, and the
 * encoder's output is not perfectly monotonic anyway.
 */
const knee = (encoded: Row[], baseline: Row) => {
  const withinTolerance = encoded.filter((row) => row.bytes <= baseline.bytes * 1.01)
  return withinTolerance.reduce((a, b) => (b.ms < a.ms ? b : a), withinTolerance[0])
}

const sweep = async (encode: (effort: number) => Promise<{ buffer?: Buffer; message: string }>) => {
  const rows: Row[] = []
  for (const effort of EFFORTS) {
    const startedAt = Date.now()
    const result = await encode(effort)
    rows.push({
      effort,
      bytes: result.buffer?.length ?? 0,
      ms: Date.now() - startedAt,
      message: result.message,
      buffer: result.buffer,
    })
  }
  return rows
}

/**
 * One table. `uploaded` is passed only for the post encoder, where "does this beat the
 * bytes we were given" is the whole question; a thumbnail is always kept, so those two
 * columns would be noise.
 */
const report = (title: string, rows: Row[], uploaded?: number) => {
  const encoded = rows.filter((row) => row.bytes > 0)
  console.log(`\n${title}`)
  if (encoded.length === 0) {
    console.log(`  no candidate produced — ${rows[0]?.message ?? 'nothing to encode'}`)
    return
  }

  // Everything is compared against the highest effort run, because that is what the
  // upload path ships today — the question this script answers is what you give up by
  // going below it, not which level is smallest in the abstract.
  const baseline = encoded[0]
  const head = uploaded
    ? `  eff |     avif |  vs upload | vs eff ${baseline.effort} |     time | kept?`
    : `  eff |     avif | vs eff ${baseline.effort} |     time`
  console.log(head)

  for (const row of rows) {
    if (row.bytes === 0) {
      console.log(`  ${String(row.effort).padStart(3)} | ${row.message}`)
      continue
    }
    const cells = [
      String(row.effort).padStart(3),
      kb(row.bytes).padStart(8),
      ...(uploaded ? [signedPct(row.bytes, uploaded).padStart(10)] : []),
      signedPct(row.bytes, baseline.bytes).padStart(9),
      (row.ms + 'ms').padStart(8),
      // 'kept' mirrors the pipeline: the post candidate only ships when it beats the upload.
      ...(uploaded ? [row.bytes < uploaded ? 'kept' : 'discarded'] : []),
    ]
    console.log(`  ${cells.join(' | ')}`)
  }

  // Deliberately labelled "cheapest within 1%" rather than "knee": at a fixed quality
  // a smaller file is usually a worse one, so this is where the size stops moving much,
  // not a free win. Compare fidelity before acting on it.
  const best = knee(encoded, baseline)
  console.log(
    `  → cheapest within 1% of effort ${baseline.effort}: effort ${best.effort} ` +
      `(${signedPct(best.bytes, baseline.bytes)} size, ` +
      `${(baseline.ms / Math.max(best.ms, 1)).toFixed(1)}x faster)`
  )
}

const main = async () => {
  const buffer = await readFile(SAMPLE)
  const meta = await sharp(buffer).metadata()
  const pixels = (meta.width ?? 0) * (meta.height ?? 0)
  const animated = (meta.pages ?? 1) > 1

  // libaom is thread-parallel and libvips sizes its pool from the host's cores, so a
  // timing here is only comparable to production if you know both numbers. The desktop
  // app deliberately runs on half of them (`main/cpu.ts`); a dev box gets whatever
  // this prints.
  console.log(
    `sharp ${sharp.versions.sharp} / libvips ${sharp.versions.vips} — ` +
      `${os.cpus().length} cores, sharp.concurrency() ${sharp.concurrency()}`
  )
  console.log(
    `${basename(SAMPLE)} — ${meta.format} ${meta.width}x${meta.height} ` +
      `(${(pixels / 1_000_000).toFixed(1)}MP), uploaded ${kb(buffer.length)}` +
      (animated ? ' [animated — compressImgForPost returns no candidate]' : '')
  )

  const post = await sweep((effort) => compressImgForPost(meta, buffer, effort))
  report('post image — lossy q50, kept only if it beats the upload', post, buffer.length)

  const thumb = await sweep((effort) => compressImgForThumbnail(buffer, effort))
  // What the bound actually produced, which is the other half of a thumbnail's cost:
  // the constants cap a box, and the image lands somewhere inside it. Read off a buffer
  // the sweep already made rather than encoding a seventh time.
  const encodedThumb = thumb.find((row) => row.buffer)
  const thumbMeta = encodedThumb ? await sharp(encodedThumb.buffer!).metadata() : null
  report(
    `thumbnail — lossy q50, always kept, bounded to ${THUMB_MAX_WIDTH}x${THUMB_MAX_HEIGHT}` +
      (thumbMeta ? ` → ${thumbMeta.width}x${thumbMeta.height}` : ''),
    thumb
  )
}

await main()
