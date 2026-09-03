import { dialog, type BrowserWindow } from 'electron'
import type { QueueState } from '../shared/api'

/**
 * The queue is worth more than it looks, and closing the window throws it away.
 *
 * Staging a folder means tagging it — a set of forty rows, each with an artist, a rating
 * and a source typed in by hand, none of which is written down anywhere until Upload is
 * pressed. Nothing here is a document with a save button, so the window's × is the only
 * thing standing between that work and nothing, and it used to close in silence.
 *
 * Rows that already uploaded count too. They are the only record of *which* posts this
 * run created — the queue is where their numbers are, and the links that open them — so
 * a queue that is finished is still a queue somebody may not be done reading.
 *
 * The renderer pushes its count whenever the queue changes rather than main asking for
 * it at close time: a `close` handler can veto synchronously or not at all, and a round
 * trip to a window that might be busy encoding is not something to do inside one.
 */
let state: QueueState = { pending: 0, uploaded: 0, busy: false }

export function setQueueState(next: QueueState): void {
  state = next
}

/** An empty queue closes the way it always did — no dialog for nothing. */
export function queueIsWorthKeeping(): boolean {
  return state.pending + state.uploaded > 0
}

function describe(): { message: string; detail: string } {
  const { pending, uploaded, busy } = state
  if (busy) {
    return {
      message: 'An upload is still running.',
      detail:
        'Quitting now stops it partway through, and the image it is working on may be ' +
        'left half-written on the board.',
    }
  }
  if (pending > 0) {
    const rest = uploaded > 0 ? ` ${uploaded} already uploaded.` : ''
    return {
      message: `${pending} ${pending === 1 ? 'image is' : 'images are'} still waiting to upload.`,
      detail: `Their tags, ratings and sources are only in this window and will be lost.${rest}`,
    }
  }
  return {
    message: `The queue still lists ${uploaded} uploaded ${uploaded === 1 ? 'post' : 'posts'}.`,
    detail: 'The posts are on the board and stay there — only the list of links goes.',
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
