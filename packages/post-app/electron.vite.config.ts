import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
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

export default defineConfig({
  main: {
    // sharp and @supabase/supabase-js stay `require`d from node_modules rather than
    // bundled: sharp is a native module, and bundling a client that does its own
    // dynamic imports only makes the output harder to debug.
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
