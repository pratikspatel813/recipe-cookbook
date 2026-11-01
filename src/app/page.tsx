"use client";

// Home: the feed. Newest public recipes from people you follow, newest first.
// If you don't follow anyone yet (or they haven't posted), it falls back to
// "Discover" — recent posts from everyone — so the screen is never empty.

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPosts, type Post } from "@/lib/social";
import { useAccount } from "@/lib/account";
import { track } from "@/lib/analytics";
import { PostCard } from "@/components/PostViews";

export default function HomeFeed() {
  const account = useAccount();
  const [feed, setFeed] = useState<Post[] | null>(null);
  const [discover, setDiscover] = useState<Post[]>([]);

  useEffect(() => {
    if (account.status === "loading") return;
    (async () => {
      const following = await listPosts({ onlyFollowing: true });
      setFeed(following);
      if (following.length < 3) {
        const mine = account.userId;
        setDiscover((await listPosts({ limit: 20 })).filter((p) => p.ownerId !== mine && !following.some((f) => f.id === p.id)));
      }
      track("feed_viewed", { post_count: following.length, following_count: new Set(following.map((p) => p.ownerId)).size });
    })().catch((err) => {
      console.error(err);
      setFeed([]);
    });
  }, [account]);

  return (
    <main className="mx-auto max-w-xl">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur">
        <h1 className="font-display text-2xl">Cookbook</h1>
      </header>

      {feed === null && <p className="py-20 text-center italic text-ink-soft">Setting the table…</p>}

      {feed?.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {feed !== null && feed.length === 0 && (
        <div className="px-6 py-10 text-center">
          <p className="font-display text-2xl">Your feed is empty</p>
          <p className="mt-2 text-sm italic text-ink-soft">Follow friends to see the recipes they post here.</p>
          <Link href="/search" className="mt-4 inline-block rounded-sm bg-accent px-5 py-2 font-display text-page">
            Find people
          </Link>
        </div>
      )}

      {discover.length > 0 && (
        <section className="mt-4">
          <h2 className="px-4 pb-2 text-xs uppercase tracking-[0.3em] text-ink-soft">Discover</h2>
          {discover.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </section>
      )}
    </main>
  );
}
