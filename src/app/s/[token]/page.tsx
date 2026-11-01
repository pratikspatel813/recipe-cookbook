// /s/<token> — the page a friend opens from a share link.
//
// Unlike our other pages, this one is rendered on the SERVER (no "use client"
// at the top). Why: when you paste a link into iMessage or WhatsApp, their
// servers fetch the page to build a preview. They don't run JavaScript, so the
// recipe title and photo must already be in the HTML we send back.

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getSharedRecipe } from "@/lib/db";
import { SharedRecipeView } from "./SharedRecipeView";

type Props = { params: Promise<{ token: string }> };

// A server-side database client with no user. get_shared_recipe() allows that.
// cache() means the metadata and the page share one database call, not two.
const loadShare = cache(async (token: string) => {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  return getSharedRecipe(client, token);
});

// Open Graph tags: what shows up in the link preview bubble.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shared = await loadShare((await params).token);
  if (!shared) return { title: "Recipe not found" };
  const { recipe } = shared;
  const description = recipe.description ?? "A recipe shared from a friend's cookbook.";
  // e.g. "Easy pancakes · from Pratik's cookbook" — a name you know gets more taps.
  const title = shared.sharerName ? `${recipe.title} · from ${shared.sharerName}'s cookbook` : recipe.title;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: recipe.imageUrl ? [recipe.imageUrl] : [],
    },
  };
}

export default async function SharedRecipePage({ params }: Props) {
  const shared = await loadShare((await params).token);

  if (!shared) {
    return (
      <main className="px-4 py-20 text-center">
        <p className="font-display text-3xl">This recipe isn&apos;t available</p>
        <p className="mt-3 italic text-ink-soft">The link may be wrong, or the recipe was removed.</p>
        <Link href="/" className="mt-6 inline-block italic text-accent underline">
          Go to my cookbook
        </Link>
      </main>
    );
  }

  return <SharedRecipeView shared={shared} />;
}
