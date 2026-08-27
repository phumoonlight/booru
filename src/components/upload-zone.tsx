'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
 * Admin-only uploader: the whole page is the drop target, and the button covers
 * the case where dragging isn't an option (phones, file pickers). No form —
 * everything lands tagged `tagme` and is edited afterwards.
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

  // Window-level so the drop target is the page, not a boxed-in element
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth++
      setDragging(true)
    }
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      void upload(Array.from(event.dataTransfer?.files ?? []))
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [upload])

  const done = items.length > 0 && items.every((item) => item.status !== 'pending')

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex min-h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-background disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Upload'}
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

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/85 p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent px-6 py-12 text-center">
            <p className="text-base font-semibold">Drop images to upload</p>
            <p className="text-sm text-muted">
              Each one is tagged <span className="font-mono">{INITIAL_TAG}</span> — edit tags later
            </p>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-sm rounded-lg border border-border bg-surface p-3 text-left shadow-lg sm:inset-x-auto sm:right-3">
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
                Dismiss
              </button>
            )}
          </div>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
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
    </>
  )
}
