/**
 * Sweeps the AVIF `effort` setting through compressImgForPost() over tests/static/example.jpg
 * and prints what each level actually buys.
 *
 * The point is the trade it measures, not the absolute numbers: effort is encode time
 * spent searching for a smaller file, and past some level the search stops finding
 * anything. Where that level sits depends on the input — flat line art keeps paying off
 * much further down than a photo does — so swap example.jpg for whatever content this
 * site actually gets before trusting the answer. A synthetic gradient will tell you
 * effort 3 is free and it is not.
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

const SAMPLE = 'tests/static/example.jpg'
const EFFORTS = [9, 7, 6, 5, 4, 3]

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}kB`
const signedPct = (candidate: number, baseline: number) => {
  if (baseline === 0) return 'n/a'
  const delta = ((candidate - baseline) / baseline) * 100
  if (Math.abs(delta) < 0.05) return '±0.0%'
  return `${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)}%`
}

const main = async () => {
  const buffer = await readFile(SAMPLE)
  const meta = await sharp(buffer).metadata()
  const pixels = (meta.width ?? 0) * (meta.height ?? 0)
  const animated = (meta.pages ?? 1) > 1

  // libaom is thread-parallel and libvips sizes its pool from the host's cores, so a
  // timing here is only comparable to production if you know both numbers. A Vercel
  // function gets 1-4 vCPU; a dev box gets whatever this prints.
  console.log(
    `sharp ${sharp.versions.sharp} / libvips ${sharp.versions.vips} — ` +
      `${os.cpus().length} cores, sharp.concurrency() ${sharp.concurrency()}`
  )
  console.log(
    `${basename(SAMPLE)} — ${meta.format} ${meta.width}x${meta.height} ` +
      `(${(pixels / 1_000_000).toFixed(1)}MP), uploaded ${kb(buffer.length)}` +
      (animated ? ' [animated — compressImgForPost returns no candidate]' : '')
  )

  const rows = []
  for (const effort of EFFORTS) {
    const startedAt = Date.now()
    const result = await compressImgForPost(meta, buffer, effort)
    rows.push({
      effort,
      bytes: result.buffer?.length ?? 0,
      ms: Date.now() - startedAt,
      message: result.message,
    })
  }

  const encoded = rows.filter((row) => row.bytes > 0)
  if (encoded.length === 0) {
    console.log(`no candidate produced — ${rows[0]?.message ?? 'nothing to encode'}`)
    return
  }

  // Everything is compared against the highest effort run, because that is what the
  // upload path ships today — the question this script answers is what you give up by
  // going below it, not which level is smallest in the abstract.
  const baseline = encoded[0]
  console.log(`\n  eff |     avif |  vs upload | vs eff ${baseline.effort} |     time | kept?`)
  for (const row of rows) {
    if (row.bytes === 0) {
      console.log(`  ${String(row.effort).padStart(3)} | ${row.message}`)
      continue
    }
    // 'kept' mirrors uploadPost(): the candidate only ships when it beats the upload.
    const kept = row.bytes < buffer.length ? 'kept' : 'discarded'
    console.log(
      `  ${String(row.effort).padStart(3)} | ${kb(row.bytes).padStart(8)} | ` +
        `${signedPct(row.bytes, buffer.length).padStart(10)} | ` +
        `${signedPct(row.bytes, baseline.bytes).padStart(9)} | ` +
        `${(row.ms + 'ms').padStart(8)} | ${kept}`
    )
  }

  // The knee: the cheapest effort still within 1% of the baseline's size. That tolerance
  // is deliberate slack — a 0.5% larger file is not worth 4x the encode time on a 1-vCPU
  // function, and the encoder's output is not perfectly monotonic anyway.
  const withinTolerance = encoded.filter((row) => row.bytes <= baseline.bytes * 1.01)
  const best = withinTolerance.reduce((a, b) => (b.ms < a.ms ? b : a), withinTolerance[0])
  console.log(
    `\n→ knee: effort ${best.effort} (${signedPct(best.bytes, baseline.bytes)} size, ` +
      `${(baseline.ms / Math.max(best.ms, 1)).toFixed(1)}x faster than effort ${baseline.effort})`
  )
}

await main()
