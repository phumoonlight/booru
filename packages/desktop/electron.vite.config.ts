import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * `@common` is packages/common — the upload pipeline, the post write path, the image
 * compressors and the pure helpers, compiled straight out of source. That is not a
 * copy: there is one definition of what a post is and one of how an image is squeezed,
 * and both front ends compile the same files.
 *
 * It used to point at the website's `src/` under two names, `@web` and `@` — the second
 * only because the Next app's own files spell each other that way. The code both apps
 * need now lives somewhere that belongs to neither of them, so there is one alias and
 * the desktop build no longer reaches into the website at all. See
 * `packages/common/src/upload/pipeline.ts` for what the split looks like from the
 * other side.
 */
const alias = { '@common': resolve(__dirname, '../common/src') }

/** The repo root, where the website's own environment file already lives. */
const envDir = resolve(__dirname, '../..')

/**
 * Which board a copy of this app talks to is decided here, at build time, and compiled
 * into the main bundle — read from the same environment file at the repo root the
 * website uses.
 *
 * It used to be boxes on a settings screen, typed in on first launch. That put the
 * board's writing credential on every machine that ran the app, in a file the app itself
 * wrote, and made "which board is this pointing at" a question only the person holding it
 * could answer. An installer built from this checkout is now built *for* one board, and
 * the app asks for nothing.
 *
 * **`DATABASE_URL_APP`, not `DATABASE_URL`.** The website's variable holds `booru_web`,
 * which may read and may touch one column; this one holds `booru_app`, which may write
 * every row. Two names because they are two accounts with different powers, and a build
 * that quietly compiled in the read-only one would fail on the first upload rather than
 * here. Neither is `DATABASE_URL_OWNER`, which may create tables and never leaves the
 * machine the migrations run on.
 *
 * All of them are required, `NEXT_PUBLIC_SITE_URL` included — the website treats that one
 * as optional because Vercel supplies a deployment URL to fall back on, and nothing here
 * does, so "open this post on the board" would have nowhere to go. A missing value fails
 * the build rather than shipping an installer that cannot reach anything.
 */
const REQUIRED_ENV = [
  'DATABASE_URL_APP',
  'NEXT_PUBLIC_CDN_URL',
  'NEXT_PUBLIC_SITE_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const

/** What the example file ships, which is not a value — a placeholder left in is a miss. */
function isPlaceholder(value: string): boolean {
  return value.includes('YOUR_')
}

function buildEnv(mode: string) {
  const env = loadEnv(mode, envDir, '')
  const missing = REQUIRED_ENV.filter((key) => {
    const value = env[key]?.trim()
    return !value || isPlaceholder(value)
  })

  if (missing.length > 0) {
    throw new Error(
      'packages/desktop cannot be built without these values:\n' +
        missing.map((key) => `  - ${key}`).join('\n') +
        `\n\nThey are read from the environment file in ${envDir} — see .env.example. ` +
        'This app has no setup screen: which board a build talks to is decided here and ' +
        'compiled in.'
    )
  }

  return {
    databaseUrl: env.DATABASE_URL_APP.trim(),
    cdnUrl: env.NEXT_PUBLIC_CDN_URL.trim().replace(/\/+$/, ''),
    siteUrl: env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/+$/, ''),
    r2: {
      accountId: env.R2_ACCOUNT_ID.trim(),
      accessKeyId: env.R2_ACCESS_KEY_ID.trim(),
      secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim(),
      bucket: env.R2_BUCKET.trim(),
    },
  }
}

export default defineConfig(({ mode }) => ({
  main: {
    // Dependencies stay `require`d from node_modules rather than bundled: sharp is a
    // native module, postgres opens sockets, and the AWS SDK is large and does its own
    // dynamic loading — bundling any of them only makes the output harder to debug. That
    // is electron-vite's `build.externalizeDeps`, on by default — it was
    // `externalizeDepsPlugin()` until that plugin was deprecated in v5.
    resolve: { alias },
    // Main only. The renderer has no keys and is not about to get any: it is handed the
    // project URL to display and nothing else, and a `define` over there would compile
    // the service-role key into a file the window loads.
    define: { __BUILD_ENV__: JSON.stringify(buildEnv(mode)) },
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
  },
  preload: {
    resolve: { alias },
    build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
}))
