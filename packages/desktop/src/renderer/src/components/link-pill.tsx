/**
 * An artist's link as a pill: the site's logo, when it is a site we know, and the host.
 *
 * Drawn logos rather than emoji, which is the exception `icons.tsx` makes — there is no
 * emoji for a brand. Paths are Simple Icons' (CC0), on a 24 unit box. X and Tumblr are
 * monochrome marks and take the text colour; Facebook and pixiv keep their own blue, which
 * is most of what makes them recognisable at 14px. Any other host gets no logo rather than
 * a generic globe: the host name already says what a globe would.
 */

type Logo = { fill?: string; path: string }

const X: Logo = {
  path: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
}

const FACEBOOK: Logo = {
  fill: '#0866FF',
  path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
}

const TUMBLR: Logo = {
  path: 'M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.205 1.936-.419l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.002z',
}

const PIXIV: Logo = {
  fill: '#0096FA',
  path: 'M4.935 0A4.924 4.924 0 0 0 0 4.935v14.13A4.924 4.924 0 0 0 4.935 24h14.13A4.924 4.924 0 0 0 24 19.065V4.935A4.924 4.924 0 0 0 19.065 0zm7.81 4.547c2.181 0 4.058.676 5.399 1.847a6.118 6.118 0 0 1 2.116 4.66c.005 1.854-.88 3.476-2.257 4.563-1.375 1.092-3.225 1.697-5.258 1.697-2.314 0-4.46-.87-4.46-.87v2.253h.614c.417 0 .77.346.77.745v.482H4.466v-.482c0-.4.353-.745.77-.745h.614V6.33c-.353.146-.623.311-.623.311l-.518-1.03s1.766-1.07 5.066-1.07zm-.165 1.25c-1.263 0-2.34.268-3.265.604v8.745c.787.357 1.849.61 3.265.61 1.795 0 3.297-.505 4.316-1.349 1.02-.843 1.567-1.998 1.567-3.3 0-1.305-.56-2.463-1.558-3.293-.997-.83-2.453-1.017-4.325-1.017z',
}

/** Registrable domain → logo. A host matches its domain and every subdomain of it, which is
 *  what a Tumblr blog (`name.tumblr.com`) and `www.pixiv.net` both need. */
const LOGOS: [string, Logo][] = [
  ['x.com', X],
  ['twitter.com', X],
  ['facebook.com', FACEBOOK],
  ['fb.com', FACEBOOK],
  ['pixiv.net', PIXIV],
  ['tumblr.com', TUMBLR],
]

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function logoFor(host: string): Logo | null {
  const found = LOGOS.find(([domain]) => host === domain || host.endsWith(`.${domain}`))
  return found ? found[1] : null
}

/**
 * Opens the link in the browser. The host is the label unless `full` is set — the editor
 * shows the whole address, since that is where a wrong one is noticed and removed.
 */
export function LinkPill({ url, full = false }: { url: string; full?: boolean }) {
  const host = hostOf(url)
  const logo = logoFor(host)

  return (
    <button
      type="button"
      onClick={() => void window.api.openExternal(url)}
      title={url}
      className="flex min-h-7 min-w-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs text-foreground transition-colors hover:border-accent"
    >
      {logo && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0"
          fill={logo.fill ?? 'currentColor'}
        >
          <path d={logo.path} />
        </svg>
      )}
      <span className="truncate">{full ? url : host}</span>
    </button>
  )
}
