"use client";

// A profile page, Instagram-style: name and counts on top, then a grid.
//
//   Your own profile has two tabs:
//     Posts     — recipes you've made public (what everyone sees)
//     Cookbook  — every recipe you've saved, private ones included, with your
//                 chapters shown as "highlight" circles. (Instagram's version of
//                 this is the Saved tab.)
//   Someone else's profile shows their Posts and a Follow button.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  chapterErrorMessage,
  createCollection,
  deleteCollection,
  listCollections,
  listRecipes,
  renameCollection,
  type Collection,
  type SavedRecipe,
} from "@/lib/db";
import { follow, getProfile, listConnections, listPosts, unfollow, type Person, type Post, type Profile } from "@/lib/social";
import { signOut, useAccount } from "@/lib/account";
import { track } from "@/lib/analytics";
import { Avatar, PostGrid, PostTile } from "./PostViews";
import { SignUpDialog } from "./SignUpDialog";
import { ThemeToggle } from "./ThemeToggle";

type Tab = "posts" | "cookbook";

export function ProfileView({ profileId }: { profileId: string | null }) {
  // profileId null = "me", whoever I am (including an anonymous user with no profile yet).
  const account = useAccount();
  const router = useRouter();
  const myId = account.status === "loading" ? null : account.userId;
  const targetId = profileId ?? myId;
  const isOwn = account.status !== "loading" && targetId === myId;

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [sheet, setSheet] = useState<"followers" | "following" | null>(null);
  const [signUpFor, setSignUpFor] = useState<"follow" | "publish" | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  // Anonymous users have no profile, so their "profile" is just their cookbook.
  const isAnonymousSelf = isOwn && account.status === "anonymous";

  useEffect(() => {
    if (!targetId) return;
    if (isAnonymousSelf) {
      setProfile(null);
      setTab("cookbook");
      return;
    }
    getProfile(targetId).then(setProfile).catch(() => setProfile(null));
    listPosts({ ownerId: targetId, limit: 60 }).then(setPosts).catch(() => setPosts([]));
  }, [targetId, isAnonymousSelf]);

  useEffect(() => {
    if (targetId && account.status !== "loading") {
      track("profile_viewed", { profile_id: targetId, is_own: isOwn, tab });
    }
  }, [targetId, isOwn, tab, account.status]);

  async function toggleFollow() {
    if (!profile) return;
    if (account.status === "anonymous") return setSignUpFor("follow");
    setFollowBusy(true);
    const nowFollowing = !profile.isFollowing;
    // Optimistic: update the button and count straight away, undo on failure.
    setProfile({ ...profile, isFollowing: nowFollowing, followerCount: profile.followerCount + (nowFollowing ? 1 : -1) });
    try {
      if (nowFollowing) {
        await follow(profile.id);
        track("followed", { profile_id: profile.id, source: "profile" });
      } else {
        await unfollow(profile.id);
        track("unfollowed", { profile_id: profile.id });
      }
    } catch (err) {
      console.error(err);
      setProfile(profile);
    } finally {
      setFollowBusy(false);
    }
  }

  async function handleSignOut() {
    await track("signed_out", {}); // must land while we're still signed in
    await signOut();
    window.location.href = "/";
  }

  if (account.status === "loading" || profile === undefined) {
    return <p className="py-20 text-center italic text-ink-soft">Opening the cookbook…</p>;
  }

  if (!profile && !isAnonymousSelf) {
    return <p className="py-20 text-center font-display text-2xl">Profile not found</p>;
  }

  const name = profile?.displayName ?? "My";

  return (
    <main className="mx-auto max-w-3xl pt-6">
      {/* ---- Header ---- */}
      <header className="px-4">
        <div className="flex items-center justify-between text-sm italic text-ink-soft">
          {isOwn ? (
            <Link href="/metrics" className="hover:text-accent">
              App metrics
            </Link>
          ) : (
            <span />
          )}
          {isOwn && (
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {account.status === "registered" && (
                <button onClick={handleSignOut} className="hover:text-accent">
                  Sign out
                </button>
              )}
              {isAnonymousSelf && (
                <Link href="/signin" className="hover:text-accent">
                  Sign in
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-5 sm:gap-8">
          <Avatar name={profile?.displayName ?? "C"} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">{profile ? `${name}'s` : "My"}</p>
            <h1 className="font-display text-3xl sm:text-4xl">Cookbook</h1>
            {profile && (
              <dl className="mt-3 flex gap-5 text-sm">
                <Count label="posts" value={profile.postCount} />
                <Count label="followers" value={profile.followerCount} onClick={() => setSheet("followers")} />
                <Count label="following" value={profile.followingCount} onClick={() => setSheet("following")} />
              </dl>
            )}
          </div>
        </div>

        {!isOwn && profile && (
          <button
            onClick={toggleFollow}
            disabled={followBusy}
            className={`mt-5 w-full rounded-sm py-2 font-display transition disabled:opacity-60 ${
              profile.isFollowing ? "border border-rule bg-page text-ink hover:border-accent" : "bg-accent text-on-accent hover:brightness-110"
            }`}
          >
            {profile.isFollowing ? "Following" : "Follow"}
          </button>
        )}

        {isAnonymousSelf && (
          <div className="mt-5 rounded-sm border border-rule bg-page px-4 py-3 text-sm">
            <p className="italic text-ink-soft">Create a profile to post your own recipes and follow friends.</p>
            <button onClick={() => setSignUpFor("publish")} className="mt-2 font-display text-accent underline">
              Create my profile
            </button>
          </div>
        )}
      </header>

      {/* ---- Tabs (own profile only) ---- */}
      {isOwn && profile && (
        <nav className="mt-6 flex border-b border-rule font-display text-sm">
          <TabButton label="Posts" active={tab === "posts"} onClick={() => setTab("posts")} />
          <TabButton label="Cookbook" active={tab === "cookbook"} onClick={() => setTab("cookbook")} />
        </nav>
      )}

      <section className="mt-1">
        {tab === "posts" && <PostsTab posts={posts} isOwn={isOwn} />}
        {tab === "cookbook" && isOwn && <CookbookTab />}
      </section>

      {sheet && profile && (
        <ConnectionsSheet profileId={profile.id} kind={sheet} onClose={() => setSheet(null)} />
      )}

      {signUpFor && (
        <SignUpDialog
          trigger={signUpFor}
          onClose={() => setSignUpFor(null)}
          doneLabel={signUpFor === "follow" ? "Follow" : "Go to my profile"}
          onDone={() => {
            setSignUpFor(null);
            if (signUpFor === "follow") toggleFollow();
            else router.refresh();
          }}
        />
      )}
    </main>
  );
}

function PostsTab({ posts, isOwn }: { posts: Post[] | null; isOwn: boolean }) {
  if (posts === null) return <p className="py-10 text-center italic text-ink-soft">…</p>;
  if (posts.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="font-display text-2xl">No posts yet</p>
        <p className="mt-2 text-sm italic text-ink-soft">
          {isOwn ? "Write a recipe of your own and post it to your profile." : "Nothing shared publicly yet."}
        </p>
        {isOwn && (
          <Link href="/add" className="mt-5 inline-block rounded-sm bg-accent px-5 py-2 font-display text-on-accent">
            Write a recipe
          </Link>
        )}
      </div>
    );
  }
  return (
    <PostGrid>
      {posts.map((p) => (
        <li key={p.id}>
          <PostTile post={p} />
        </li>
      ))}
    </PostGrid>
  );
}

// Your whole cookbook, private recipes included. Chapters are shown as
// circles you tap to filter — Instagram's "story highlights". This is also
// where you make, rename and delete chapters.
function CookbookTab() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [chapter, setChapter] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  // The name box, when open: making a new chapter, or renaming the selected one.
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = collections.find((c) => c.id === chapter) ?? null;

  useEffect(() => {
    listCollections().then(setCollections).catch(console.error);
  }, []);

  useEffect(() => {
    setRecipes(null);
    listRecipes(chapter ?? undefined).then(setRecipes).catch(() => setRecipes([]));
  }, [chapter]);

  function choose(id: string | null) {
    setChapter(id);
    closeNaming();
    track("chapter_filtered", { chapter_id: id });
  }

  function openNaming(mode: "new" | "rename") {
    setNaming(mode);
    setName(mode === "rename" ? (selected?.name ?? "") : "");
    setError(null);
  }

  function closeNaming() {
    setNaming(null);
    setError(null);
  }

  const byName = (a: Collection, b: Collection) => a.name.localeCompare(b.name);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (naming === "new") {
        const created = await createCollection(trimmed);
        setCollections((prev) => [...prev, created].sort(byName));
        setChapter(created.id);
        track("chapter_created", { chapter_id: created.id, source: "cookbook_tab" });
      } else if (selected && trimmed !== selected.name) {
        await renameCollection(selected.id, trimmed);
        setCollections((prev) => prev.map((c) => (c.id === selected.id ? { ...c, name: trimmed } : c)).sort(byName));
        track("chapter_renamed", { chapter_id: selected.id });
      }
      closeNaming();
    } catch (err) {
      setError(chapterErrorMessage(err, trimmed));
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const what = selected.recipeCount === 1 ? "1 recipe" : `${selected.recipeCount} recipes`;
    if (!confirm(`Delete the “${selected.name}” chapter? Its ${what} will stay in your cookbook.`)) return;
    try {
      await deleteCollection(selected.id);
      track("chapter_deleted", { chapter_id: selected.id, recipe_count: selected.recipeCount });
      setCollections((prev) => prev.filter((c) => c.id !== selected.id));
      setChapter(null);
    } catch (err) {
      console.error(err);
      setError("Couldn't delete that chapter. Try again.");
    }
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto px-4 py-4">
        <Highlight label="All" active={chapter === null} onClick={() => choose(null)} />
        {collections.map((c) => (
          <Highlight key={c.id} label={c.name} count={c.recipeCount} active={chapter === c.id} onClick={() => choose(c.id)} />
        ))}
        <Highlight label="New" icon="+" active={naming === "new"} onClick={() => openNaming("new")} />
      </div>

      {naming && (
        <form onSubmit={saveName} className="mx-4 mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && closeNaming()}
            maxLength={60}
            placeholder={naming === "new" ? "Chapter name, e.g. Sunday baking" : "New name"}
            aria-label={naming === "new" ? "New chapter name" : "Rename chapter"}
            className="min-w-0 flex-1 rounded-full border border-accent bg-page px-4 py-1.5 text-sm outline-none"
          />
          <button type="submit" disabled={!name.trim()}
            className="rounded-full bg-accent px-4 py-1.5 text-sm text-on-accent disabled:opacity-40">
            {naming === "new" ? "Add" : "Save"}
          </button>
          <button type="button" onClick={closeNaming} className="text-sm text-ink-soft hover:text-accent">
            Cancel
          </button>
        </form>
      )}

      {selected && !naming && (
        <div className="mx-4 mb-3 flex items-center justify-between text-sm">
          <span className="font-display text-lg">{selected.name}</span>
          <span className="flex gap-4 italic text-ink-soft">
            <button onClick={() => openNaming("rename")} className="hover:text-accent">Rename</button>
            <button onClick={handleDelete} className="hover:text-accent">Delete</button>
          </span>
        </div>
      )}
      {error && <p className="mx-4 mb-3 text-sm text-accent">{error}</p>}
      {collections.length === 0 && !naming && chapter === null && (
        <p className="mx-4 mb-3 text-sm italic text-ink-soft">
          Make chapters like Breakfast or Sunday baking to sort your recipes.
        </p>
      )}
      {recipes === null && <p className="py-10 text-center italic text-ink-soft">…</p>}
      {recipes?.length === 0 && (
        <div className="px-6 py-14 text-center">
          <p className="font-display text-2xl">{chapter ? "This chapter is empty" : "Your cookbook is empty"}</p>
          <Link href="/add" className="mt-5 inline-block rounded-sm bg-accent px-5 py-2 font-display text-on-accent">
            Add a recipe
          </Link>
        </div>
      )}
      {recipes && recipes.length > 0 && (
        <PostGrid>
          {recipes.map((r) => (
            <li key={r.id}>
              <PostTile post={r} badge={r.isPublic ? <PublicBadge /> : null} />
            </li>
          ))}
        </PostGrid>
      )}
    </>
  );
}

function Highlight({ label, count, icon, active, onClick }: {
  label: string;
  count?: number;
  icon?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-16 shrink-0 flex-col items-center gap-1">
      <span
        className={`flex size-14 items-center justify-center rounded-full border-2 bg-paper font-display text-lg ${
          active ? "border-accent text-accent" : "border-rule text-ink-soft"
        }`}
      >
        {icon ?? count ?? "★"}
      </span>
      <span className={`w-full truncate text-center text-xs ${active ? "text-accent" : "text-ink-soft"}`}>{label}</span>
    </button>
  );
}

function PublicBadge() {
  return (
    <span className="rounded-full bg-page/90 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent shadow-sm">
      Posted
    </span>
  );
}

function Count({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const content = (
    <>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="font-display text-lg">{value}</span> <span className="text-ink-soft">{label}</span>
      </dd>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="text-left hover:text-accent">
      {content}
    </button>
  ) : (
    <div>{content}</div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex-1 border-b-2 py-3 uppercase tracking-widest transition ${
        active ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

// The list that slides up when you tap "followers" or "following".
function ConnectionsSheet({ profileId, kind, onClose }: { profileId: string; kind: "followers" | "following"; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    listConnections(profileId, kind).then(setPeople).catch(() => setPeople([]));
  }, [profileId, kind]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-lg border border-rule bg-page p-5 sm:rounded-sm"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl capitalize">{kind}</h2>
          <button onClick={onClose} className="text-sm italic text-ink-soft hover:text-accent">
            Close
          </button>
        </div>
        {people === null && <p className="italic text-ink-soft">…</p>}
        {people?.length === 0 && <p className="italic text-ink-soft">No one yet.</p>}
        <ul className="space-y-3">
          {people?.map((p) => (
            <li key={p.id}>
              <Link href={`/u/${p.id}`} onClick={onClose} className="flex items-center gap-3 hover:text-accent">
                <Avatar name={p.displayName} size="sm" />
                <span className="font-display">{p.displayName}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
