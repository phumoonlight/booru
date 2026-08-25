import { notFound } from 'next/navigation'
import { getPost, getPostTagNames } from '@/lib/data/posts'
import { thumbnailUrl } from '@/lib/storage'
import { EditPostForm } from './edit-form'

export default async function EditPostPage({ params }: PageProps<'/admin/posts/[id]'>) {
  const { id } = await params
  const postId = Number(id)
  if (!Number.isInteger(postId)) notFound()

  const post = await getPost(postId)
  if (!post) notFound()
  const tags = await getPostTagNames(postId)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Edit post #{post.id}</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl(post.md5)}
        alt={`Post ${post.id}`}
        className="max-h-64 w-fit rounded-lg border border-border object-contain"
      />
      <EditPostForm
        postId={post.id}
        initialTags={tags.join(' ')}
        initialRating={post.rating}
        initialSourceUrl={post.source_url ?? ''}
      />
    </div>
  )
}
