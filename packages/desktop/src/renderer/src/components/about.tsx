import type { AppStatus } from '../../../shared/api'

/**
 * What version am I running, and what is this thing. The window has no menu bar
 * (`autoHideMenuBar`), so the About box every desktop app keeps under Help has to be a
 * screen like the other two.
 *
 * Electron and Chromium sit beside the app's own version because a rendering or a
 * file-dialog bug is theirs as often as it is ours, and asking for them after the fact
 * means asking someone to find a devtools console.
 */
export function About({ status }: { status: AppStatus }) {
  const { app, electron, chrome } = status.versions

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Pubooru Desktop</h1>
        <p className="mt-1 text-sm text-muted">Version {app}</p>
      </div>

      <p className="text-sm text-muted">
        The board’s upload page, run locally. Compression is CPU work — a lossless AVIF
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
        <Row label="Upload limit">
          {status.limits.maxFileSizeLabel} and {status.limits.maxPixels / 1_000_000}MP per
          image
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
