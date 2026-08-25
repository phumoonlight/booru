import { createClient } from "@/lib/supabase/server";

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

export async function getPostTagNames(postId: number): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("post_tags")
    .select("tags(name)")
    .eq("post_id", postId);
  return (data ?? [])
    .flatMap((row) => (row.tags ? [row.tags] : []))
    .map((t) => (t as unknown as { name: string }).name)
    .sort();
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
