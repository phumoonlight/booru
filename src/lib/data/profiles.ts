import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  username: string;
  role: "admin" | "member";
  created_at: string;
};

/** Profile of the signed-in user, or null when anonymous. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, username, role, created_at")
    .eq("id", user.id)
    .single();
  return data;
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}
