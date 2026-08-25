"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { uploadPost, type UploadState } from "@/lib/actions/upload";

const RATINGS = ["general", "sensitive", "questionable", "explicit"] as const;

export default function UploadPage() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(
    uploadPost,
    null
  );
  const [preview, setPreview] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Upload</h2>

      {state?.ok && (
        <p className="rounded-lg border border-green-500/30 bg-green-500/15 px-3 py-2 text-sm text-green-400">
          Uploaded — post #{state.postId}.{" "}
          <Link href={`/posts/${state.postId}`} className="underline">
            View
          </Link>{" "}
          (page arrives in Phase 3)
        </p>
      )}
      {state && !state.ok && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-400">
          {state.error}
          {state.existingPostId !== undefined && (
            <>
              {" — "}
              <Link
                href={`/posts/${state.existingPostId}`}
                className="underline"
              >
                see post #{state.existingPostId}
              </Link>
            </>
          )}
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Image
          <input
            type="file"
            name="file"
            accept="image/*"
            required
            onChange={onFileChange}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:text-background"
          />
        </label>

        {preview && (
          // Local object URL preview — next/image doesn't apply
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Preview"
            className="max-h-80 w-full rounded-lg border border-border object-contain"
          />
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          Tags (space-separated, e.g. <span className="font-mono">blue_sky landscape</span>)
          <textarea
            name="tags"
            required
            rows={3}
            className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Rating
          <select
            name="rating"
            defaultValue="general"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          >
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Source URL (optional)
          <input
            type="url"
            name="source_url"
            placeholder="https://…"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-accent font-medium text-background disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>
    </div>
  );
}
