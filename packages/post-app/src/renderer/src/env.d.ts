/// <reference types="vite/client" />

import type { PostAppApi } from '../../shared/api'

declare global {
  interface Window {
    /** Exposed by src/preload/index.ts — the renderer's entire vocabulary. */
    api: PostAppApi
  }
}

export {}
