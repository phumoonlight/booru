export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 lg:flex-row-reverse lg:items-start">
      <div className="h-96 w-full animate-pulse rounded-lg border border-border bg-surface lg:flex-1" />
      <div className="flex flex-col gap-3 lg:w-64 lg:shrink-0">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-5 w-full animate-pulse rounded bg-surface" />
        ))}
      </div>
    </div>
  )
}
