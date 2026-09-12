import { tagLabel } from '@common/search'
import { BUTTON_SM } from './buttons'
import { categoryColor } from '@common/tags'
import { PostLink } from './post-link'
import type { TagSeed } from './tag-seed'

/**
 * An image that is already on the board. Its md5 is settled at staging
 * (`main/staging.ts`), so this is known before anything is typed — which is the point of
 * checking there rather than letting the upload find out: tagging a post that cannot be
 * made is the only work this screen can waste.
 *
 * No form, then, and no picture either: what is left to decide is whether to look at the
 * post that already exists, and whether to keep this on screen at all.
 */
export function Duplicate({
  siteUrl,
  postId,
  onReview,
  onRemove,
}: {
  siteUrl: string
  postId: number | undefined
  onReview: (postId: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-3 text-sm text-yellow-300">
        <span>
          <span aria-hidden>⚠ </span>
          Already on the board as post #{postId}
        </span>
        {postId !== undefined && (
          <>
            <PostLink siteUrl={siteUrl} postId={postId} label="Open on the board" />
            <button
              type="button"
              onClick={() => onReview(postId)}
              title="Open that post in the editor"
              className={BUTTON_SM}
            >
              ✏️ Review tags
            </button>
          </>
        )}
      </p>
      <p className="text-xs text-muted">
        The same bytes are the same post — there is nothing here to upload.
      </p>
      <div className="flex">
        <button
          type="button"
          onClick={onRemove}
          className="min-h-9 rounded-lg border border-border px-3 text-xs transition-colors hover:bg-background"
        >
          Take it off the form
        </button>
      </div>
    </div>
  )
}

/**
 * A finished upload. It says what landed rather than only that something did: the tags the
 * post actually carries, read back from the board, and a way straight into the editor.
 *
 * Both because this is the moment tagging is checked. A tag that was meant to go on and
 * did not is invisible from a line that only says "Uploaded", and this is where you still
 * remember what the picture was supposed to be tagged — ten uploads later it is a search
 * to find again.
 */
export function Uploaded({
  siteUrl,
  postId,
  tags,
  onReview,
  onNext,
}: {
  siteUrl: string
  postId: number | undefined
  tags: TagSeed[] | undefined
  onReview: (postId: number) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-3 text-sm">
        <PostLink siteUrl={siteUrl} postId={postId} label={`Uploaded — post #${postId}`} />
        {postId !== undefined && (
          <button
            type="button"
            onClick={() => onReview(postId)}
            title="Open this post in the editor"
            className={BUTTON_SM}
          >
            ✏️ Review tags
          </button>
        )}
        {/* The way on, beside the way back into what was just made — the two things there
            are to do here, and neither of them is scrolling. */}
        <button
          type="button"
          onClick={onNext}
          title="Clear this and stage another image"
          className={BUTTON_SM}
        >
          ➕ Upload another
        </button>
      </p>

      {tags === undefined ? (
        <p className="text-xs text-muted">Reading its tags…</p>
      ) : tags.length === 0 ? (
        <p className="text-xs text-muted">No tags — nothing will find this post.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.name}
              className={`rounded bg-surface px-2 py-0.5 font-mono text-xs ${categoryColor(tag.category)}`}
            >
              {tagLabel(tag.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
