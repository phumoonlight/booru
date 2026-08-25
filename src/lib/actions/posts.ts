"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { parseTagInput } from "@/lib/tags";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPost } from "@/lib/data/posts";
import { originalPath, thumbnailPath } from "@/lib/storage";

export async function deletePost(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid post id");

  const post = await getPost(id);
  if (!post) throw new Error("Post not found");

  // Row first (cascades post_tags, trigger decrements tag counts), then files
  const supabase = await createClient();
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  const storage = createAdminClient().storage;
  await storage.from("originals").remove([originalPath(post.md5, post.file_ext)]);
  await storage.from("thumbnails").remove([thumbnailPath(post.md5)]);

  revalidatePath("/");
  revalidatePath("/admin/posts");
}

const editSchema = z.object({
  id: z.coerce.number().int(),
  tags: z.string().min(1, "At least one tag is required"),
  rating: z.enum(["general", "sensitive", "questionable", "explicit"]),
  source_url: z
    .union([z.literal(""), z.url("Source must be a valid URL")])
    .optional(),
});

export type EditPostState = { error: string } | null;

export async function updatePost(
  _prevState: EditPostState,
  formData: FormData
): Promise<EditPostState> {
  await requireAdmin();

  const parsed = editSchema.safeParse({
    id: formData.get("id"),
    tags: formData.get("tags"),
    rating: formData.get("rating"),
    source_url: formData.get("source_url") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { tags, invalid } = parseTagInput(parsed.data.tags);
  if (invalid.length > 0) {
    return {
      error: `Invalid tags (lowercase a-z 0-9 _ ( ) . - only): ${invalid.join(", ")}`,
    };
  }
  if (tags.length === 0) {
    return { error: "At least one tag is required" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_post_with_tags", {
    p_post_id: parsed.data.id,
    p_rating: parsed.data.rating,
    p_source_url: parsed.data.source_url ?? "",
    p_tags: tags,
  });
  if (error) {
    return { error: `Update failed: ${error.message}` };
  }

  revalidatePath("/");
  revalidatePath("/admin/posts");
  redirect("/admin/posts");
}
