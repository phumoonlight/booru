import { ImplicationList } from './implication-list'
import { RecommendationList } from './recommendation-list'

/**
 * Both sets of tag rules, on one screen because they are one idea with two answers to
 * the same question — "this tag is on the post, what else should be?" An implication
 * answers it for you; a recommendation asks. Keeping them apart in the header would have
 * meant two nav items for one habit, and a rule written in the wrong half is easier to
 * notice when the other half is under it.
 *
 * Both are this machine's, and both live in `save.json`.
 */
export function TagRules({ siteUrl }: { siteUrl: string }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Tag rules</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          What one tag says about the rest. Kept on this machine, in{' '}
          <span className="font-mono">save.json</span> beside your settings — the board has no
          rules of its own, and nothing here is uploaded.
        </p>
      </div>

      <ImplicationList siteUrl={siteUrl} />
      <RecommendationList siteUrl={siteUrl} />
    </div>
  )
}
