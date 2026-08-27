'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { uploadPost, type UploadResult } from '@/lib/actions/upload'
import { INITIAL_TAG } from '@/lib/tags'

type Item = {
  name: string
  status: 'pending' | 'ok' | 'error'
  message?: string
  postId?: number
}

/**
 * Admin-only uploader for /upload: a bounded drop area plus a file picker for
 * the cases where dragging isn't an option (phones). No form — everything lands
 * tagged `tagme` and is edited afterwards.
 */
export function UploadZone() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Item[]>([])

  const upload = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith('image/'))
      if (images.length === 0) return

      setItems(images.map((file) => ({ name: file.name, status: 'pending' })))
      setBusy(true)

      let uploaded = 0
      for (const [index, file] of images.entries()) {
        const data = new FormData()
        data.set('file', file)

        let result: UploadResult
        try {
          result = await uploadPost(data)
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : 'Upload failed' }
        }
        if (result.ok) uploaded++

        setItems((prev) =>
          prev.map((item, i) =>
            i === index
              ? result.ok
                ? { ...item, status: 'ok', postId: result.postId }
                : { ...item, status: 'error', message: result.error, postId: result.existingPostId }
              : item
          )
        )
      }

      setBusy(false)
      if (uploaded > 0) router.refresh()
    },
    [router]
  )

  const done = items.length > 0 && items.every((item) => item.status !== 'pending')

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void upload(Array.from(event.dataTransfer.files))
        }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center ${
          dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface'
        }`}
      >
        <p className="text-base font-semibold">Drop images to upload</p>
        <p className="text-sm text-muted">
          Each one is tagged <span className="font-mono">{INITIAL_TAG}</span> — edit tags later
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-1 flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Choose images'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {busy
                ? `Uploading ${items.filter((i) => i.status !== 'pending').length + 1}/${items.length}…`
                : `${items.filter((i) => i.status === 'ok').length}/${items.length} uploaded`}
            </p>
            {done && (
              <button
                type="button"
                onClick={() => setItems([])}
                className="text-sm text-muted hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          <ul className="flex flex-col gap-1 text-xs">
            {items.map((item, i) => (
              <li key={`${item.name}-${i}`} className="flex flex-col">
                <span className="truncate text-muted">{item.name}</span>
                {item.status === 'pending' && <span className="text-muted">Uploading…</span>}
                {item.status === 'ok' && item.postId !== undefined && (
                  <Link href={`/posts/${item.postId}`} className="text-accent hover:underline">
                    Uploaded — post #{item.postId}
                  </Link>
                )}
                {item.status === 'error' && (
                  <span className="text-red-400">
                    {item.message}
                    {item.postId !== undefined && (
                      <>
                        {' — '}
                        <Link href={`/posts/${item.postId}`} className="underline">
                          post #{item.postId}
                        </Link>
                      </>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
