import { useCallback, useEffect, useRef, useState } from 'react'
import { type Rating } from '@common/search'
import { currentBoard } from '../board-store'
import { seedsToInput } from './category-tag-field'
import type { TagSeed } from './tag-seed'
import { invalidateTags } from './tag-index-store'
import { invalidateBrowse } from './browse-store'
import {
  impliedRating,
  raisedRating,
  type ImplicationRules,
  type ImpliedRating,
} from '../../../shared/implications'
import { useImplications } from '../implications'
import type { StagedFile, StageOutcome, UploadResult } from '../../../shared/api'

type Status = 'ready' | 'uploading' | 'ok' | 'error' | 'duplicate'

export type Staged = {
  file: StagedFile
  tags: TagSeed[]
  rating: Rating
  sourceUrl: string
  status: Status
  message?: string
  postId?: number
  /**
   * What the post actually came out carrying, read back from the board rather than
   * assumed from what was sent. The rules add tags at upload and the pipeline dedupes, so
   * the list that went up is not quite the list that landed — and this exists to be
   * checked, which a copy of the request could not do.
   */
  postTags?: TagSeed[]
  /**
   * The post already holding these bytes, found when the file was staged rather than when
   * it was uploaded. A row like this is a notice: there is no post to make from it, so
   * there is nothing to tag it with either.
   */
  duplicateOf?: number
}

/**
 * The rule that has something to say about this image's rating, or null. Shared by the
 * floor and by the note under the select, so the form can never obey one rule and blame
 * another.
 */
function ratingRule(tags: TagSeed[], rules: ImplicationRules): ImpliedRating | null {
  return impliedRating(
    tags.map((tag) => tag.name),
    rules
  )
}
/**
 * The one image the upload form is holding, and everything that happens to it: staging,
 * the question a replacement has to ask first, the rating floor its tags imply, and the
 * upload itself.
 *
 * Split out from the form because the two are different in kind — one is a picture with
 * fields under it, the other is a small state machine with a bridge on the far side of it
 * — and because `onCleared` is the only thread between them: whatever takes the image away
 * has to close the viewer and the import over the top of it.
 */
export function useUploadItem(onCleared: () => void) {
  // Held in a ref because the form passes an inline arrow: on a dependency list it would
  // be a new function every render, and the callbacks below are memoized precisely so a
  // half-typed image does not re-stage itself on every keystroke.
  const cleared = useRef(onCleared)
  useEffect(() => {
    cleared.current = onCleared
  })

  const [staging, setStaging] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [item, setItem] = useState<Staged | null>(null)
  /**
   * A question waiting for a yes, or null. Two of them, and they are the same question
   * about the same thing: what is staged was typed by hand and is held nowhere else, so
   * both the ✕ that throws it away and the file that would take its place have to ask
   * first. `next` is what to put there afterwards — nothing, for the ✕.
   *
   * An image with nothing typed into it goes without asking, as a card always did: there
   * is nothing there to confirm.
   */
  const [confirming, setConfirming] = useState<{ next: Staged | null } | null>(null)
  // What the last pick or drop turned away, with the reason main gave, plus the note that
  // says only the first of several files was taken.
  const [refused, setRefused] = useState<string[]>([])
  // Read here rather than in the field, because this is where a post is made: the fields
  // only show what the rules imply, and `seedsToInput` is what puts it on the upload.
  const rules = useImplications()
  /**
   * What a press of ✕ costs, in the words of what would be lost. An uploaded image is not
   * in it: its tags are on the board, and clearing only stops showing a post that exists.
   */
  const typedWork = useCallback((staged: Staged): string => {
    if (staged.status === 'ok' || staged.status === 'duplicate') return ''
    const typed: string[] = []
    if (staged.tags.length > 0) {
      typed.push(`${staged.tags.length} tag${staged.tags.length === 1 ? '' : 's'}`)
    }
    if (staged.sourceUrl.trim() !== '') typed.push('a source')
    return typed.join(' and ')
  }, [])

  /**
   * An image never reaches the form unless it can actually be uploaded. The main process
   * checks it — readable image, within the size and pixel limits — and hands back either a
   * staged row or the reason it can't be one, which is said out loud rather than
   * discovered halfway through an upload.
   *
   * What is already staged decides where the new one goes: onto the screen, or behind the
   * question above.
   */
  const absorb = useCallback(
    (outcomes: StageOutcome[], extra: string[] = []) => {
      const outcome = outcomes[0]
      if (!outcome) {
        setRefused(extra)
        return
      }
      if (!outcome.ok) {
        setRefused([...extra, `${outcome.name} — ${outcome.error}`])
        return
      }

      setRefused(extra)
      const next: Staged = {
        file: {
          path: outcome.path,
          name: outcome.name,
          size: outcome.size,
          width: outcome.width,
          height: outcome.height,
          preview: outcome.preview,
          md5: outcome.md5,
        },
        tags: [],
        rating: 'g',
        sourceUrl: '',
        status: outcome.duplicateOf !== null ? 'duplicate' : 'ready',
        duplicateOf: outcome.duplicateOf ?? undefined,
      }

      setItem((current) => {
        if (current && typedWork(current) !== '') {
          setConfirming({ next })
          return current
        }
        cleared.current()
        return next
      })
    },
    [typedWork]
  )

  const stage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      // One image at a time, and the extras are named rather than dropped in silence: a
      // multi-select in the OS picker is a habit from the queue this replaced, and someone
      // who does it should be told what became of the rest.
      const extra =
        paths.length > 1
          ? [`Only the first of ${paths.length} images was taken — upload them one at a time.`]
          : []
      setStaging('Reading image…')
      try {
        absorb(await window.api.stageFiles(paths.slice(0, 1), currentBoard()), extra)
      } finally {
        setStaging(null)
      }
    },
    [absorb]
  )

  /** The other way in: an image dragged straight out of a browser window. */
  const stageUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return
      const extra =
        urls.length > 1
          ? [`Only the first of ${urls.length} images was taken — upload them one at a time.`]
          : []
      setStaging('Downloading…')
      try {
        absorb(await window.api.fetchImages(urls.slice(0, 1), currentBoard()), extra)
      } finally {
        setStaging(null)
      }
    },
    [absorb]
  )

  /**
   * The rating an image keeps once its tags have changed. Raise only — `raisedRating` has
   * why — so a rule can lift an image nobody rated and can never undo a rating that was
   * set by hand or earned by a stronger tag.
   */
  const ratingFor = useCallback(
    (tags: TagSeed[], current: Rating): Rating => raisedRating(current, ratingRule(tags, rules)),
    [rules]
  )

  const patch = useCallback(
    (changes: Partial<Staged>) => {
      setItem((current) => {
        if (!current) return current
        const next = { ...current, ...changes }
        // A tag can ask for a rating floor, so any change to the list re-applies it here
        // rather than at each of the places a tag list can change — the field, the import
        // and a recommendation pressed are three callers of one rule.
        return changes.tags ? { ...next, rating: ratingFor(changes.tags, current.rating) } : next
      })
    },
    [ratingFor]
  )

  /** Throws away what is staged, and puts whatever asked for its place there instead. */
  const clear = useCallback((next: Staged | null) => {
    setItem(next)
    setConfirming(null)
    cleared.current()
  }, [])

  /**
   * Copies a post's tags on, merged rather than substituted — what is staged may already
   * carry what is different about this image, and the import is what it has in common with
   * another. The rating floor is re-applied for the same reason the tag field applies it:
   * an imported tag can ask for a rating just as a typed one can.
   */
  const importTags = useCallback(
    (tags: TagSeed[]) => {
      setItem((current) => {
        if (!current) return current
        const merged = [...current.tags]
        for (const tag of tags) {
          if (!merged.some((t) => t.name === tag.name)) merged.push(tag)
        }
        return { ...current, tags: merged, rating: ratingFor(merged, current.rating) }
      })
    },
    [ratingFor]
  )

  async function submit() {
    if (!item || item.status === 'ok' || item.status === 'duplicate') return

    setBusy(true)
    patch({ status: 'uploading', message: undefined, postId: undefined })

    let result: UploadResult
    try {
      // Read once, here, rather than in the handler: the board the upload is *for* is the
      // one that was selected when Upload was pressed, and this call is awaited.
      const board = currentBoard()
      result = await window.api.uploadPost({
        path: item.file.path,
        board,
        tags: seedsToInput(item.tags, rules),
        rating: item.rating,
        sourceUrl: item.sourceUrl,
      })
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }
    }

    if (result.ok) {
      const postId = result.postId
      patch({ status: 'ok', postId })
      // The post just created tags and moved counts, so the Tags screen's remembered index
      // is out of date, and Browse's grid is missing a post. Dropped rather than re-read:
      // they may never be looked at.
      invalidateTags()
      invalidateBrowse()
      // Awaited, unlike the queue's, which could not wait: there is nothing behind this
      // one, and the list it fills in is the whole point of the screen it lands on.
      const loaded = await window.api.getPost(postId, currentBoard())
      if (loaded) {
        patch({ postTags: loaded.tags.map(({ name, category }) => ({ name, category })) })
      }
    } else {
      patch({ status: 'error', message: result.error, postId: result.existingPostId })
    }
    setBusy(false)
  }

  // Booleans, because there is one image: what main has to decide is whether closing would
  // lose something, and a duplicate is not something — there is no post to make from it
  // and nothing typed into it (`main/close-guard.ts`).
  const staged = item !== null && item.status !== 'ok' && item.status !== 'duplicate'
  const uploaded = item?.status === 'ok'

  // Main can't ask the window what it is holding from inside a `close` handler, so the
  // window tells it as it goes.
  useEffect(() => {
    window.api.reportStaged({ staged, uploaded, busy })
  }, [staged, uploaded, busy])

  // The one thing that takes this component away rather than hiding it is the app closing,
  // and a flag left behind would have main guarding a screen that no longer exists.
  useEffect(() => {
    return () => window.api.reportStaged({ staged: false, uploaded: false, busy: false })
  }, [])

  const working = busy || staging !== null
  /** The rule that has something to say about this image's rating, or null — the same one
   *  the floor above obeys, so the form can never follow one rule and name another. */
  const rule = item ? ratingRule(item.tags, rules) : null

  return {
    item,
    staging,
    busy,
    refused,
    confirming,
    setConfirming,
    typedWork,
    stage,
    stageUrls,
    patch,
    clear,
    importTags,
    submit,
    staged,
    uploaded,
    working,
    rule,
  }
}
