// Link-preview images ("Open Graph images"): the picture iMessage, WhatsApp
// and Slack show when someone pastes a link.
//
// Next.js turns a file named opengraph-image.tsx into an image URL and adds
// the <meta property="og:image"> tag for us. The image is drawn from JSX by
// next/og, which supports a subset of CSS: every element with more than one
// child needs display: flex.

export const OG_SIZE = { width: 1200, height: 630 };

// The cookbook palette (light), matching globals.css.
export const OG = {
  paper: "#f7f1e3",
  page: "#fffdf7",
  ink: "#2b2420",
  inkSoft: "#6b5d52",
  rule: "#e4d9c3",
  accent: "#b5452f",
};

export const SITE_HOST = "recipe-cookbook-one.vercel.app";

// next/og needs raw font files. Google Fonts serves a TTF when asked without a
// browser user agent; `text=` asks for only the letters we'll draw, so the
// download is a few KB.
async function loadGoogleFont(family: string, weight: number, italic: boolean, text: string) {
  const spec = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:${spec}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error(`No font file for ${family}`);
  return (await fetch(src)).arrayBuffer();
}

// The two fonts the app uses. If Google Fonts is unreachable, fall back to
// next/og's built-in sans rather than failing the whole preview.
export async function ogFonts(text: string) {
  try {
    const [display, serif, serifItalic] = await Promise.all([
      loadGoogleFont("Playfair Display", 500, false, text),
      loadGoogleFont("Lora", 400, false, text),
      loadGoogleFont("Lora", 400, true, text),
    ]);
    return [
      { name: "Playfair", data: display, weight: 500 as const, style: "normal" as const },
      { name: "Lora", data: serif, weight: 400 as const, style: "normal" as const },
      { name: "Lora", data: serifItalic, weight: 400 as const, style: "italic" as const },
    ];
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

// Fetch a recipe photo and inline it. next/og can draw JPEG and PNG but not
// WebP or AVIF, which some recipe sites serve, so anything else is skipped
// and the card is drawn without a photo instead of breaking.
export async function ogPhoto(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/jpeg", "image/png"].includes(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// The small brand mark in the corner of every card: a tomato dot + "Cookbook".
export function OgBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 22, height: 22, borderRadius: 11, background: OG.accent }} />
      <div style={{ fontFamily: "Playfair", fontSize: 30, color: OG.ink }}>Cookbook</div>
    </div>
  );
}
