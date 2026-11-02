// The preview card for a share link: the recipe photo, its name, and whose
// cookbook it's from. "from Pratik's cookbook" is the hook: a friend's name
// gets more taps than a stranger's website.

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { getSharedRecipe } from "@/lib/db";
import { OG, OG_SIZE, OgBrand, SITE_HOST, ogFonts, ogPhoto } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A recipe shared from Cookbook";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const shared = await getSharedRecipe(client, (await params).token);

  const title = shared?.recipe.title ?? "Recipe not found";
  const from = shared?.sharerName ? `from ${shared.sharerName}'s cookbook` : "from a friend's cookbook";
  const r = shared?.recipe;
  const meta = [
    // "4" → "Serves 4", but imported values like "Makes 12" stay as they are.
    r?.servings && (/^\d+$/.test(r.servings.trim()) ? `Serves ${r.servings.trim()}` : r.servings),
    r?.totalTimeMinutes && `${r.totalTimeMinutes} min`,
    r && r.ingredients.length > 0 && `${r.ingredients.length} ingredients`,
  ].filter(Boolean).join("  ·  ");

  const photo = await ogPhoto(r?.imageUrl ?? null);
  const fonts = await ogFonts(`Cookbook${title}${from}${meta}${SITE_HOST}`);

  // Long names get a smaller size so they fit in three lines.
  const titleSize = title.length > 60 ? 54 : title.length > 32 ? 66 : 80;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: OG.paper, fontFamily: "Lora" }}>
        {photo && (
          <img src={photo} alt="" width={480} height={630} style={{ width: 480, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "56px 64px" }}>
          <OgBrand />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Playfair", fontSize: titleSize, lineHeight: 1.1, color: OG.ink }}>{title}</div>
            <div style={{ marginTop: 20, fontSize: 34, fontStyle: "italic", color: OG.accent }}>{from}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {meta && <div style={{ fontSize: 28, color: OG.inkSoft }}>{meta}</div>}
            <div style={{ display: "flex", borderTop: `2px solid ${OG.rule}`, paddingTop: 16, fontSize: 24, color: OG.inkSoft }}>
              {SITE_HOST}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
