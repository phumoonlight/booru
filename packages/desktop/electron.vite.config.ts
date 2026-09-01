import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * `@web` — and `@`, because the web's own files import each other that way — point at
 * the website's `src/`. That is not a copy: the upload pipeline, the post write path,
 * the image compressors and the pure helpers are compiled straight out of the Next app
 * next door, so there is one definition of what a post is and one of how an image is
 * squeezed. See `src/lib/upload/pipeline.ts` for what that split looks like from the
 * other side.
 */
const web = resolve(__dirname, '../../src')
const alias = { '@web': web, '@': web }

/** The repo root, where the website's own environment file already lives. */
const envDir = resolve(__dirname, '../..')

/**
 * Which board a copy of this app talks to is decided here, at build time, and compiled
 * into the main bundle — the same four values the website reads from its environment,
 * out of the same file at the repo root.
 *
 * It used to be four boxes on a settings screen, typed in on first launch. That put a
 * service-role key on every machine that ran the app, in a file the app itself wrote,
 * and made "which project is this pointing at" a question only the person holding it
 * could answer. An installer built from this checkout is now built *for* one board, and
 * the app asks for nothing but a login.
 *
 * All four are required, `NEXT_PUBLIC_SITE_URL` included — the website treats that one
 * as optional because Vercel supplies a deployment URL to fall back on, and nothing
 * here does, so "open this post on the board" would have nowhere to go. A missing value
 * fails the build rather than shipping an installer that cannot reach anything.
 */
const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
] as const

/** What the example file ships, which is not a value — a placeholder left in is a miss. */
function isPlaceholder(value: string): boolean {
  return value.startsWith('YOUR_') || value.includes('YOUR_PROJECT_REF')
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
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL.trim().replace(/\/+$/, ''),
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim(),
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    siteUrl: env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/+$/, ''),
  }
}

export default defineConfig(({ mode }) => ({
  main: {
    // sharp and @supabase/supabase-js stay `require`d from node_modules rather than
    // bundled: sharp is a native module, and bundling a client that does its own
    // dynamic imports only makes the output harder to debug. That is electron-vite's
    // `build.externalizeDeps`, on by default — it was `externalizeDepsPlugin()` until
    // that plugin was deprecated in v5.
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
