import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // The default patterns are root-anchored; the workspace in packages/ has an out/
    // and a dist/ of its own, and linting a bundle finds 700 problems in code nobody
    // wrote.
    '**/out/**',
    '**/dist/**',
  ]),
  {
    // packages/desktop is React and TypeScript, so the hook and type rules earn their
    // keep there — but it is an Electron window, not a Next app. `<img>` is the only
    // way it ever shows a picture (a data: URL from the main process), and there are no
    // pages to link to.
    files: ['packages/**'],
    rules: {
      '@next/next/no-img-element': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
])

export default eslintConfig
