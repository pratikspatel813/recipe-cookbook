// The preview card for the site itself, shown when someone shares the home
// page, the landing page or the metrics dashboard.

import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgBrand, SITE_HOST, ogFonts } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Cookbook: just the recipe";

const HEADLINE = "Just the recipe.";
const LINE = "Save recipes without the ads. Share them with friends.";
const TAGS = "Import from any link  ·  Your own recipes  ·  AI dietary swaps";

export default async function Image() {
  const fonts = await ogFonts(`Cookbook${HEADLINE}${LINE}${TAGS}${SITE_HOST}`);
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%",
                    background: OG.paper, padding: "64px 80px", fontFamily: "Lora" }}>
        <OgBrand />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Playfair", fontSize: 112, color: OG.ink }}>{HEADLINE}</div>
          <div style={{ marginTop: 16, fontSize: 38, color: OG.inkSoft }}>{LINE}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${OG.rule}`, paddingTop: 20,
                      fontSize: 24, color: OG.inkSoft }}>
          <div style={{ color: OG.accent }}>{TAGS}</div>
          <div>{SITE_HOST}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
