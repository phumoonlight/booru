import type { Post } from "@/lib/data/posts";
import { PostCard } from "@/components/post-card";

export function PostGrid({ posts }: { posts: Post[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  );
}

export function PostGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="aspect-square animate-pulse rounded-lg border border-border bg-surface"
        />
      ))}
    </ul>
  );
}
