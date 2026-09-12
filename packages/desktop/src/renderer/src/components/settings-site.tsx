import { useEffect, useState } from 'react'
import { Choice, Field, Readout } from './settings-rows'
import type { SiteState } from '@common/data/site'

/**
 * The website's maintenance switch and the sentence it shows.
 *
 * Its own component because it is the one thing on this screen that is about the *site*
 * rather than about this machine or this build — a different board to read, a different
 * failure to draw, and three states where every other row here has one.
 */
export function SiteSwitch() {
  // Three states, not two. `undefined` is "not asked yet", `null` is "asked and the board
  // did not answer" — and neither may be drawn as the switch being off, since off is the
  // state that means visitors are being served.
  const [site, setSite] = useState<SiteState | null | undefined>(undefined)
  const [editingNotice, setEditingNotice] = useState(false)
  const [siteError, setSiteError] = useState('')

  // Read once, when this screen mounts. There is no cache on the main side and none here:
  // the switch is asked for at the moment somebody has come to look at it.
  useEffect(() => {
    void window.api.getSiteState().then(setSite)
  }, [])

  /**
   * Move the switch, or re-word its notice — one write either way, because the notice is
   * only ever read while the switch is on and saving them separately would let the site
   * show yesterday's sentence for the moment between two calls.
   *
   * Optimistic, and put back on failure: this is the one control in the app whose effect
   * is invisible from here, so a row that stayed where it was put while the board refused
   * the write would be a lie about a live website.
   */
  async function saveSite(patch: { maintenance?: boolean; message?: string }) {
    const before = site ?? { maintenance: false, message: '', updatedAt: 0 }
    const next = {
      maintenance: patch.maintenance ?? before.maintenance,
      message: patch.message ?? before.message,
    }

    setSite({ ...before, ...next })
    setEditingNotice(false)
    const result = await window.api.saveSiteState(next)
    if (result.ok) {
      setSite(result.state)
      setSiteError('')
    } else {
      setSite(site ?? null)
      setSiteError(result.error)
    }
  }

  // It is here because this app is the only program that can reach the board to write, and
  // a switch on Vercel would be a redeploy to close the site and another to open it.
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="flex gap-1 text-lg font-bold tracking-tight">
          <span aria-hidden>🚧</span>
          Website
        </h2>
        <p className="mt-1 text-sm text-muted">
          Closes the public site — every page becomes a notice with a Check status button, and
          nothing on the board is touched. This window keeps working either way.
        </p>
      </div>

      {site === undefined ? (
        <p className="text-sm text-muted">Reading the board…</p>
      ) : site === null ? (
        // Not drawn as "off": off means visitors are being served, which is not something
        // a copy that cannot reach the board is in a position to say.
        <p className="rounded-lg border border-[#ff5d5f]/30 bg-[#ff5d5f]/10 px-3 py-2 text-sm text-[#ff5d5f]">
          The board could not be asked, so the switch is not shown. Nothing here has changed it.
        </p>
      ) : (
        <>
          <Choice
            label="Public site"
            value={site.maintenance ? 'closed' : 'serving'}
            options={[
              { value: 'serving', label: 'Serving' },
              { value: 'closed', label: 'Maintenance' },
            ]}
            onChange={(next) => void saveSite({ maintenance: next === 'closed' })}
            hint={
              'A visitor already on the site sees the notice on their next page. One who ' +
              'is looking at the notice sees the gallery again within ten minutes, or at ' +
              'once if they press Check status.'
            }
          />

          <Field
            label="Notice"
            placeholder="Back in an hour — re-tagging."
            value={site.message}
            hint={
              'Shown under “Down for maintenance”, which is already on the page — so this ' +
              'is for what a visitor cannot work out, like how long. Optional.'
            }
            editing={editingNotice}
            onEdit={() => setEditingNotice(true)}
            onSave={(next) => void saveSite({ message: next })}
            onCancel={() => setEditingNotice(false)}
          />

          <Readout
            label="Last changed"
            value={
              site.updatedAt === 0
                ? ''
                : new Date(site.updatedAt).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
            }
          />

          {siteError && <p className="text-sm text-[#ff5d5f]">{siteError}</p>}
        </>
      )}
    </div>
  )
}
