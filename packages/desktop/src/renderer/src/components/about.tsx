import type { AppStatus } from '../../../shared/api'

/**
 * Which build am I running, and what is this thing. The window has no menu bar
 * (`autoHideMenuBar`), so the About box every desktop app keeps under Help has to be a
 * screen like the other two.
 *
 * A build id rather than a version, because the version moved at a release and the app
 * changes between them: "2.4.0" was the honest answer to "what shipped" and a useless one
 * to "is this the copy with the fix in it". The number here is raised by every change
 * under `packages/desktop`.
 *
 * Electron and Chromium sit beside it because a rendering or a file-dialog bug is theirs
 * as often as it is ours, and asking for them after the fact means asking someone to find
 * a devtools console.
 */
/**
 * Hard-coded rather than read from package.json: the packaged app ships no manifest the
 * renderer can reach, and this is the one address that does not vary per install — the
 * board's own URL is the one that does, and that comes from settings.
 */
const REPO_URL = 'https://github.com/phumoonlight/booru'

export function About({ status }: { status: AppStatus }) {
  const { electron, chrome } = status.versions

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-8 pb-25">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Pubooru Desktop</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
          Build {status.buildId}
          {/* Only on a checkout run by `desktop:dev`. An installed copy shows nothing at
              all rather than a "Release" badge saying the ordinary thing — the tag is
              here to catch the moment you are reading the wrong window's build, or
              wondering where a catalog went (a dev run keeps its own `save.json`). */}
          {status.development && (
            <span className="rounded border border-[#ead084] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ead084]">
              Development
            </span>
          )}
        </p>
      </div>

      <p className="text-sm text-muted">
        The board’s upload page, run locally. Compression is CPU work — a full-size AVIF
        for the post and a lossy one for the thumbnail — which is what a serverless tier
        is billed for by the second and killed at ten of them. Here it costs nothing, so
        this app takes files the website has to refuse. The images and rows land in the
        same Supabase project either way.
      </p>

      <dl className="flex flex-col gap-2 text-sm">
        <Row label="Board">
          {status.siteUrl ? (
            <button
              type="button"
              onClick={() => void window.api.openExternal(status.siteUrl)}
              className="text-accent underline-offset-2 hover:underline"
            >
              {status.siteUrl}
            </button>
          ) : (
            <span className="text-muted">Not set — see Connection settings</span>
          )}
        </Row>
        <Row label="Source">
          <button
            type="button"
            onClick={() => void window.api.openExternal(REPO_URL)}
            className="text-accent underline-offset-2 hover:underline"
          >
            {REPO_URL.replace('https://', '')}
          </button>
        </Row>
        <Row label="Electron">{electron}</Row>
        <Row label="Chromium">{chrome}</Row>
      </dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 border-b border-border pb-2">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-all">{children}</dd>
    </div>
  )
}
