import { postHref } from '@common/search'
import { useBoard } from '../board-store'

/**
 * A finished post, opened in the real browser. Without a site URL in settings there is
 * nowhere to send it, so the id is still shown — it just isn't a link.
 */
export function PostLink({
  siteUrl,
  postId,
  label,
}: {
  siteUrl: string
  postId: number | undefined
  label: string
}) {
  // Read from the store rather than passed down: this sits three components deep inside
  // two that have no other reason to know which board they are on.
  const board = useBoard()

  if (postId === undefined) return null
  if (!siteUrl) return <span className="text-muted">{label}</span>
  return (
    <button
      type="button"
      // `postHref` spells the path — the web's own rule, and what puts an AI post on
      // `/ai-posts/<id>` rather than on the gallery's.
      onClick={() => void window.api.openExternal(`${siteUrl}${postHref(postId, '', board)}`)}
      className="text-accent underline-offset-2 hover:underline"
    >
      {label}
    </button>
  )
}
