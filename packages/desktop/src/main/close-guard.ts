import { dialog, type BrowserWindow } from 'electron'
import type { StagedState } from '../shared/api'

/**
 * The upload screen is worth more than it looks, and closing the window throws it away.
 *
 * A staged image is an artist, a rating, a source and a dozen tags typed in by hand, none
 * of which is written down anywhere until Upload is pressed. Nothing here is a document
 * with a save button, so the window's × is the only thing standing between that work and
 * nothing, and it used to close in silence.
 *
 * A finished upload counts too. The screen is the only record of *which* post was just
 * made — the number is there, and the link that opens it — so a screen that is done is
 * still one somebody may not have read.
 *
 * The renderer pushes what it holds whenever that changes rather than main asking for it
 * at close time: a `close` handler can veto synchronously or not at all, and a round trip
 * to a window that might be busy encoding is not something to do inside one.
 */
let state: StagedState = { staged: false, uploaded: false, busy: false }

export function setStagedState(next: StagedState): void {
  state = next
}

/** An empty screen closes the way it always did — no dialog for nothing. */
export function stagedWorkIsWorthKeeping(): boolean {
  return state.staged || state.uploaded
}

function describe(): { message: string; detail: string } {
  const { staged, uploaded, busy } = state
  if (busy) {
    return {
      message: 'An upload is still running.',
      detail:
        'Quitting now stops it partway through, and the image it is working on may be ' +
        'left half-written on the board.',
    }
  }
  if (staged) {
    const rest = uploaded ? ' The post before it is already uploaded.' : ''
    return {
      message: 'An image is still waiting to upload.',
      detail: `Its tags, rating and source are only in this window and will be lost.${rest}`,
    }
  }
  return {
    message: 'The upload screen still shows the post you just made.',
    detail: 'The post is on the board and stays there — only the link to it goes.',
  }
}

/**
 * Modal on the window, so it cannot be lost behind it. Cancel is both the default and
 * what Escape does: the answer that keeps the work is the one a mis-hit should give.
 */
export async function confirmClose(window: BrowserWindow): Promise<boolean> {
  const { message, detail } = describe()
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Close Pubooru Desktop?',
    message,
    detail,
    buttons: ['Close anyway', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  return response === 0
}
