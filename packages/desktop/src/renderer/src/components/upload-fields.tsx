import { RATING_COLOR, RATING_LABEL, RATINGS, type Rating } from '@common/search'
import { CategoryTagField } from './category-tag-field'
import { PostLink } from './post-link'
import type { TagSeed } from './tag-seed'
import type { ImpliedRating } from '../../../shared/implications'
import type { Staged } from './upload-item'

/**
 * Why the rating is what it is. A rating that moves on its own is the one change nobody
 * watched happen — the tag box is where you were looking — so the form names the rule
 * rather than leaving you to guess which of eight tags did it, or whether the app simply
 * lost your rating.
 *
 * Worded as what the rule *asks for*, which stays true whether the image is sitting on
 * that floor or above it: the alternative was claiming to have raised a rating that may
 * well have been set by hand.
 */
function RatingNote({ rule }: { rule: ImpliedRating | null }) {
  if (!rule) return null
  return (
    <p className="flex items-baseline gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted">
      <span aria-hidden>⬆</span>
      <span>
        Your rule on <span className="font-mono text-foreground">{rule.from}</span> asks for at
        least <span className="font-mono text-foreground">{RATING_LABEL[rule.rating]}</span>.
      </span>
    </p>
  )
}

/**
 * Everything typed about one image: its tags, its rating, where it came from, and what the
 * board said if the upload was refused.
 *
 * The three of them are one thing — they are the post, minus the picture — and they are
 * the only part of this screen that is a form. The rule note sits under them rather than
 * beside the select, because what it explains is a value that moved by itself.
 */
export function UploadFields({
  item,
  rule,
  busy,
  siteUrl,
  onChange,
  onImport,
}: {
  item: Staged
  /** The rating floor this image's tags ask for, from the same call the floor itself
   *  obeys — so the form cannot follow one rule and name another. */
  rule: ImpliedRating | null
  busy: boolean
  siteUrl: string
  onChange: (changes: Partial<Staged>) => void
  onImport: () => void
}) {
  return (
    <>
      <CategoryTagField
        value={item.tags}
        onChange={(tags: TagSeed[]) => onChange({ tags })}
        actions={
          // On the TAGS line rather than in a row of its own: it fills that whole field at
          // once, from a post already tagged the way this one wants to be, so it belongs to
          // the heading it acts on. Unbordered — a bordered button above a field of bordered
          // chips read as one of them.
          <button
            type="button"
            onClick={onImport}
            disabled={busy}
            title="Copy the tags from a post on the board"
            className="flex min-h-7 items-center rounded px-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            <span aria-hidden>📋</span>&nbsp;Import tags from a post
          </button>
        }
        disabled={busy}
        imply
        recommend
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-col gap-1.5 text-sm sm:w-44">
          Rating
          {/* Coloured closed and open, the same colours the grid, the board and the post
              editor use for the scale. */}
          <select
            value={item.rating}
            disabled={busy}
            onChange={(event) => onChange({ rating: event.target.value as Rating })}
            className={`min-h-11 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-accent ${RATING_COLOR[item.rating]}`}
          >
            {RATINGS.map((rating: Rating) => (
              <option
                key={rating}
                value={rating}
                className={`bg-background ${RATING_COLOR[rating]}`}
              >
                {RATING_LABEL[rating]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          Source URL (optional)
          <input
            type="url"
            value={item.sourceUrl}
            disabled={busy}
            onChange={(event) => onChange({ sourceUrl: event.target.value })}
            placeholder="https://…"
            className="min-h-11 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-accent"
          />
        </label>
      </div>

      <RatingNote rule={rule} />

      {item.status === 'error' && (
        <p className="text-xs text-red-400">
          {item.message}
          {item.postId !== undefined && (
            <>
              {' — '}
              <PostLink siteUrl={siteUrl} postId={item.postId} label={`post #${item.postId}`} />
            </>
          )}
        </p>
      )}
    </>
  )
}
