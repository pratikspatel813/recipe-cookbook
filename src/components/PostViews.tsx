"use client";

// How a recipe looks as a "post": a square tile for profile grids and search
// results, and a full card for the home feed.

import Link from "next/link";
import type { Post } from "@/lib/social";

// A square grid tile. Recipes without a photo (most hand-written ones) get a
// cookbook-style title card instead, so the grid never shows empty squares.
export function PostTile({
  post,
  href,
  badge,
  onClick,
}: {
  post: Pick<Post, "id" | "title" | "imageUrl">;
  href?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link href={href ?? `/recipe/${post.id}`} onClick={onClick} className="group relative block aspect-square overflow-hidden bg-page">
      <PostImage post={post} />
      {badge && <span className="absolute top-1.5 right-1.5">{badge}</span>}
    </Link>
  );
}

// The picture part of a post, without a link around it.
export function PostImage({ post }: { post: Pick<Post, "title" | "imageUrl"> }) {
  return post.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- images come from any recipe site
    <img src={post.imageUrl} alt={post.title} className="size-full object-cover transition group-hover:opacity-90" />
  ) : (
    <TitleCard title={post.title} />
  );
}

function TitleCard({ title }: { title: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center border border-rule bg-[radial-gradient(circle_at_30%_20%,var(--page),var(--paper))] p-3 text-center">
      <span className="mb-1 text-[10px] uppercase tracking-[0.25em] text-accent/70">Recipe</span>
      <span className="line-clamp-3 font-display text-sm leading-snug sm:text-lg">{title}</span>
    </div>
  );
}

// A grid of tiles: three across, with thin gaps, like an Instagram profile.
export function PostGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-3 gap-0.5 sm:gap-1">{children}</ul>;
}

// A feed card: who posted it, the photo, the title.
export function PostCard({ post, onOpen }: { post: Post; onOpen?: () => void }) {
  return (
    <article className="border-b border-rule pb-5">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href={`/u/${post.ownerId}`} className="flex items-center gap-3">
          <Avatar name={post.ownerName} size="sm" />
          <span className="font-display">{post.ownerName}</span>
        </Link>
        <span className="text-xs italic text-ink-soft">· {timeAgo(post.createdAt)}</span>
      </header>
      <Link href={`/recipe/${post.id}`} onClick={onOpen} className="block">
        <div className="group aspect-square w-full overflow-hidden sm:aspect-[4/3]">
          <PostImage post={post} />
        </div>
        <div className="px-4 pt-3">
          <h2 className="font-display text-xl leading-snug">{post.title}</h2>
          {post.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{post.description}</p>}
          {post.totalTimeMinutes && <p className="mt-1 text-xs italic text-ink-soft">{post.totalTimeMinutes} min</p>}
        </div>
      </Link>
    </article>
  );
}

// A circle with the person's first initial. (No photo uploads yet.)
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-8 text-sm", md: "size-12 text-lg", lg: "size-20 text-3xl" };
  return (
    <span
      aria-hidden
      className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-full border border-accent/40 bg-paper font-display text-accent`}
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
