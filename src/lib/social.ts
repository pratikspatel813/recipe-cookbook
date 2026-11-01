// The social side: public posts, profiles, follows and search.
// Most of it calls the SQL functions in supabase/migrations/007_social.sql.

import { supabase, ensureUser } from "./supabase";

// A recipe as it appears in a feed or grid — just enough to draw the tile.
export type Post = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  totalTimeMinutes: number | null;
  createdAt: string;
  ownerId: string;
  ownerName: string;
};

export type Profile = {
  id: string;
  displayName: string;
  joinedAt: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

export type Person = { id: string; displayName: string };

// ---- Posts ----------------------------------------------------------------

type PostFilters = { onlyFollowing?: boolean; ownerId?: string; search?: string; limit?: number };

export async function listPosts(filters: PostFilters = {}): Promise<Post[]> {
  await ensureUser();
  const { data, error } = await supabase.rpc("list_public_recipes", {
    only_following: filters.onlyFollowing ?? false,
    owner: filters.ownerId ?? null,
    search: filters.search ?? null,
    lim: filters.limit ?? 30,
  });
  if (error) throw error;
  return data as Post[];
}

// Post a recipe to your profile, or take it back down.
export async function setRecipePublic(recipeId: string, isPublic: boolean): Promise<void> {
  await ensureUser();
  const { error } = await supabase.from("recipes").update({ is_public: isPublic }).eq("id", recipeId);
  if (error) throw error;
}

// ---- Profiles & follows ------------------------------------------------------

export async function getProfile(profileId: string): Promise<Profile | null> {
  await ensureUser();
  const { data, error } = await supabase.rpc("get_profile", { profile_id: profileId });
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function getDisplayName(userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name ?? null;
}

export async function follow(profileId: string): Promise<void> {
  await ensureUser();
  const { error } = await supabase.from("follows").insert({ following_id: profileId });
  // 23505 = "already exists": following someone you already follow is fine.
  if (error && error.code !== "23505") throw error;
}

export async function unfollow(profileId: string): Promise<void> {
  const userId = await ensureUser();
  const { error } = await supabase.from("follows").delete().eq("follower_id", userId).eq("following_id", profileId);
  if (error) throw error;
}

// Followers or following, as a list of people.
export async function listConnections(profileId: string, kind: "followers" | "following"): Promise<Person[]> {
  await ensureUser();
  const [matchColumn, otherColumn] = kind === "followers" ? ["following_id", "follower_id"] : ["follower_id", "following_id"];
  const { data: rows, error } = await supabase
    .from("follows")
    .select(otherColumn)
    .eq(matchColumn, profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (rows as unknown as Record<string, string>[]).map((r) => r[otherColumn]);
  if (ids.length === 0) return [];
  const { data: people, error: peopleError } = await supabase.from("profiles").select("id, display_name").in("id", ids);
  if (peopleError) throw peopleError;
  return people.map((p) => ({ id: p.id, displayName: p.display_name }));
}

// ---- Search -------------------------------------------------------------------

export async function searchPeople(query: string): Promise<Person[]> {
  await ensureUser();
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", `%${q.replace(/[%_]/g, "")}%`) // strip SQL wildcards from what people type
    .limit(20);
  if (error) throw error;
  return data.map((p) => ({ id: p.id, displayName: p.display_name }));
}
