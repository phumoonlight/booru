import { createClient } from "@/lib/supabase/server";
import { getTagByName, type Tag } from "@/lib/data/tags";

export const POSTS_PER_PAGE = 24;

export type Post = {
  id: number;
  md5: string;
  file_ext: string;
  file_size: number;
  width: number;
  height: number;
  rating: "general" | "sensitive" | "questionable" | "explicit";
  source_url: string | null;
  status: "active" | "pending" | "deleted";
  score: number;
  created_at: string;
};

export type PostPage = {
  posts: Post[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Browse listing. `tag` filters to a single tag — multi-tag AND/negation arrives in
 * Phase 4 via the search_posts RPC, which replaces this filter entirely.
 * RLS restricts anonymous callers to active posts.
 */
export async function getPosts({
  page = 1,
  tag,
}: { page?: number; tag?: string } = {}): Promise<PostPage> {
  const supabase = await createClient();
  const from = (page - 1) * POSTS_PER_PAGE;

  let tagId: number | undefined;
  if (tag) {
    const found = await getTagByName(tag);
    // Unknown tag → no posts, rather than silently listing everything
    if (!found) return { posts: [], total: 0, page, pageCount: 0 };
    tagId = found.id;
  }

  const query =
    tagId === undefined
      ? supabase.from("posts").select("*", { count: "exact" })
      : supabase
          .from("posts")
          .select("*, post_tags!inner(tag_id)", { count: "exact" })
          .eq("post_tags.tag_id", tagId);

  const { data, count } = await query
    .order("id", { ascending: false })
    .range(from, from + POSTS_PER_PAGE - 1);

  const total = count ?? 0;
  return {
    posts: (data ?? []) as Post[],
    total,
    page,
    pageCount: Math.ceil(total / POSTS_PER_PAGE),
  };
}

export async function getPostByMd5(md5: string): Promise<Post | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("md5", md5)
    .maybeSingle();
  return data;
}

export async function getPost(id: number): Promise<Post | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getPostTags(postId: number): Promise<Tag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("post_tags")
    .select("tags(id, name, category, post_count)")
    .eq("post_id", postId);

  return (data ?? [])
    .flatMap((row) => (row.tags ? [row.tags as unknown as Tag] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPostTagNames(postId: number): Promise<string[]> {
  const tags = await getPostTags(postId);
  return tags.map((t) => t.name);
}

/** Adjacent post ids for prev/next navigation on the detail page. */
export async function getPostNeighbours(
  id: number
): Promise<{ prevId: number | null; nextId: number | null }> {
  const supabase = await createClient();
  const [older, newer] = await Promise.all([
    supabase
      .from("posts")
      .select("id")
      .lt("id", id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("posts")
      .select("id")
      .gt("id", id)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return { prevId: newer.data?.id ?? null, nextId: older.data?.id ?? null };
}

/** Admin list — RLS lets the admin see all statuses. */
export async function getRecentPosts(limit = 50): Promise<Post[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);
  return data ?? [];
}
