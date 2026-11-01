"use client";

// Search public recipes and people. Before you type, it shows recent posts
// from everyone, like Instagram's Explore grid.

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPosts, searchPeople, type Person, type Post } from "@/lib/social";
import { track } from "@/lib/analytics";
import { Avatar, PostGrid, PostTile } from "@/components/PostViews";

type Tab = "recipes" | "people";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("recipes");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);

  // Wait until typing pauses for 300ms before searching. Without this "debounce",
  // typing "chickpea" would fire 8 searches, one per letter.
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      try {
        if (tab === "recipes") {
          const results = await listPosts({ search: q || undefined, limit: 60 });
          setPosts(results);
          if (q) track("search_performed", { tab, query_length: q.length, result_count: results.length });
        } else {
          const results = await searchPeople(q);
          setPeople(results);
          if (q) track("search_performed", { tab, query_length: q.length, result_count: results.length });
        }
      } catch (err) {
        console.error(err);
      }
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, tab]);

  const q = query.trim();

  return (
    <main className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-30 border-b border-rule bg-paper/95 px-4 pt-4 backdrop-blur">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "recipes" ? "Search recipes or ingredients" : "Search people"}
          className="w-full rounded-full border border-rule bg-page px-4 py-2 outline-none placeholder:text-ink-soft/60 focus:border-accent"
        />
        <nav className="mt-2 flex font-display text-sm">
          {(["recipes", "people"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px flex-1 border-b-2 py-2 capitalize transition ${
                tab === t ? "border-accent text-accent" : "border-transparent text-ink-soft"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === "recipes" && (
        <>
          {!q && <p className="px-4 pt-3 pb-2 text-xs uppercase tracking-[0.3em] text-ink-soft">Recently posted</p>}
          {posts === null && <p className="py-10 text-center italic text-ink-soft">…</p>}
          {posts?.length === 0 && (
            <p className="px-6 py-14 text-center italic text-ink-soft">
              {q ? `No recipes match “${q}”.` : "No one has posted a recipe yet."}
            </p>
          )}
          {posts && posts.length > 0 && (
            <div className={q ? "pt-1" : ""}>
              <PostGrid>
                {posts.map((p, i) => (
                  <li key={p.id}>
                    <PostTile
                      post={p}
                      onClick={() => q && track("search_result_clicked", { tab: "recipes", position: i + 1, result_id: p.id })}
                    />
                  </li>
                ))}
              </PostGrid>
            </div>
          )}
        </>
      )}

      {tab === "people" && (
        <ul className="divide-y divide-rule">
          {!q && <li className="px-6 py-14 text-center italic text-ink-soft">Type a name to find friends.</li>}
          {q && people?.length === 0 && <li className="px-6 py-14 text-center italic text-ink-soft">No one called “{q}”.</li>}
          {q &&
            people?.map((p, i) => (
              <li key={p.id}>
                <Link
                  href={`/u/${p.id}`}
                  onClick={() => track("search_result_clicked", { tab: "people", position: i + 1, result_id: p.id })}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-page"
                >
                  <Avatar name={p.displayName} />
                  <span className="font-display text-lg">{p.displayName}</span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </main>
  );
}
