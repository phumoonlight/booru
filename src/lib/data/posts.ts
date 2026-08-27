import { createClient } from '@/lib/supabase/server'
import type { Tag } from '@/lib/data/tags'

export type Post = {
  id: number
  md5: string
  file_ext: string
  file_size: number
  width: number
  height: number
  rating: 'general' | 'sensitive' | 'questionable' | 'explicit'
  source_url: string | null
  status: 'active' | 'pending' | 'deleted'
  score: number
  created_at: string
}

export type PostPage = {
  posts: Post[]
  total: number
  page: number
  pageCount: number
}

// Browse listings go through searchPosts() in lib/data/search.ts — an empty query
// returns the whole active gallery.

export async function getPostByMd5(md5: string): Promise<Post | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('posts').select('*').eq('md5', md5).maybeSingle()
  return data
}

export async function getPost(id: number): Promise<Post | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('posts').select('*').eq('id', id).maybeSingle()
  return data
}

export async function getPostTags(postId: number): Promise<Tag[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('post_tags')
    .select('tags(id, name, category, post_count)')
    .eq('post_id', postId)

  return (data ?? [])
    .flatMap((row) => (row.tags ? [row.tags as unknown as Tag] : []))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPostTagNames(postId: number): Promise<string[]> {
  const tags = await getPostTags(postId)
  return tags.map((t) => t.name)
}

/** Adjacent post ids for prev/next navigation on the detail page. */
export async function getPostNeighbours(
  id: number
): Promise<{ prevId: number | null; nextId: number | null }> {
  const supabase = await createClient()
  const [older, newer] = await Promise.all([
    supabase
      .from('posts')
      .select('id')
      .lt('id', id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('posts')
      .select('id')
      .gt('id', id)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  return { prevId: newer.data?.id ?? null, nextId: older.data?.id ?? null }
}
