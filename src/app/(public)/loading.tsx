import { PostGridSkeleton } from '@/components/post-grid'

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <div className="h-6 w-32 animate-pulse rounded bg-surface" />
      <PostGridSkeleton />
    </div>
  )
}
