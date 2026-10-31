// The shape of a recipe inside our app. Every import method (URL, paste,
// manual) ends up producing this same object, so the rest of the app only
// has to understand one format. These fields map 1:1 to the database tables
// we'll add later: recipes, ingredients, steps.

export type Ingredient = {
  position: number; // order in the list (1, 2, 3...)
  quantity: number | null; // 1.5  (null for "salt to taste")
  unit: string | null; // "cup"
  name: string; // "all-purpose flour"
  rawText: string; // "1 1/2 cups all-purpose flour" — always keep the original
};

export type Step = {
  position: number;
  text: string;
};

export type Recipe = {
  title: string;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  author: string | null;
  servings: string | null;
  totalTimeMinutes: number | null;
  ingredients: Ingredient[];
  steps: Step[];
};

// ---------------------------------------------------------------------------
// Step 1: find the recipe data hidden in the page.
//
// Most recipe blogs embed a block like this so Google can show recipe cards
// in search results:
//
//   <script type="application/ld+json">
//     { "@type": "Recipe", "name": "...", "recipeIngredient": [...] }
//   </script>
//
// That block is pure data — no ads, no life story. We read it directly.
// ---------------------------------------------------------------------------

export function extractRecipeFromHtml(html: string, sourceUrl: string): Recipe | null {
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptRegex)) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue; // some sites ship broken JSON; skip that block and keep looking
    }
    const node = findRecipeNode(data);
    if (node) return normalizeRecipe(node, sourceUrl);
  }
  return null;
}

type JsonObject = Record<string, unknown>;

// The Recipe object can be nested in arrays or inside an "@graph" list,
// so we search recursively until we find something whose @type is Recipe.
function findRecipeNode(data: unknown): JsonObject | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (data && typeof data === "object") {
    const obj = data as JsonObject;
    const type = obj["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes("Recipe")) return obj;
    if (obj["@graph"]) return findRecipeNode(obj["@graph"]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step 2: clean it up. Every site formats this data a little differently,
// so we normalize it into our Recipe type.
// ---------------------------------------------------------------------------

function normalizeRecipe(node: JsonObject, sourceUrl: string): Recipe {
  const ingredientLines = asStringArray(node.recipeIngredient ?? node.ingredients);

  return {
    title: decodeEntities(asString(node.name) ?? "Untitled recipe"),
    description: cleanText(asString(node.description)),
    imageUrl: extractImage(node.image),
    sourceUrl,
    author: extractAuthor(node.author),
    servings: extractServings(node.recipeYield),
    totalTimeMinutes: parseDuration(asString(node.totalTime) ?? asString(node.cookTime)),
    ingredients: ingredientLines.map((line, i) => parseIngredient(cleanText(line) ?? line, i + 1)),
    steps: extractSteps(node.recipeInstructions).map((text, i) => ({ position: i + 1, text })),
  };
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter((s): s is string => !!s);
  const single = asString(value);
  return single ? [single] : [];
}

function extractImage(image: unknown): string | null {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return extractImage(image[0]);
  if (image && typeof image === "object") return asString((image as JsonObject).url);
  return null;
}

function extractAuthor(author: unknown): string | null {
  if (typeof author === "string") return author;
  if (Array.isArray(author)) return extractAuthor(author[0]);
  if (author && typeof author === "object") return asString((author as JsonObject).name);
  return null;
}

function extractServings(recipeYield: unknown): string | null {
  const values = asStringArray(recipeYield);
  // Sites often send ["4", "4 servings"]; the longer one is more readable.
  return values.sort((a, b) => b.length - a.length)[0] ?? null;
}

// Instructions come in many shapes: one long string, a list of strings,
// a list of {"@type": "HowToStep", "text": ...}, or sections containing steps.
function extractSteps(instructions: unknown): string[] {
  if (!instructions) return [];
  if (typeof instructions === "string") {
    return instructions
      .split(/\n+|(?<=\.)\s+(?=\d+\.\s)/)
      .map((s) => cleanText(s))
      .filter((s): s is string => !!s);
  }
  if (Array.isArray(instructions)) return instructions.flatMap(extractSteps);
  if (typeof instructions === "object") {
    const obj = instructions as JsonObject;
    if (obj.itemListElement) return extractSteps(obj.itemListElement); // HowToSection
    const text = cleanText(asString(obj.text) ?? asString(obj.name));
    return text ? [text] : [];
  }
  return [];
}

// ISO 8601 durations, e.g. "PT1H30M" -> 90
function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return minutes > 0 ? minutes : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanText(text: string | null): string | null {
  if (!text) return null;
  const cleaned = decodeEntities(text.replace(/<[^>]+>/g, " ")) // strip stray HTML tags
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

// ---------------------------------------------------------------------------
// Step 3: split each ingredient line into quantity / unit / name.
//
// "1 1/2 cups all-purpose flour" -> { quantity: 1.5, unit: "cup", name: "all-purpose flour" }
//
// This is what makes the future AI dietary-swap feature possible: we can find
// "garlic" in the name field instead of searching through free text.
// It won't be perfect — that's fine, we always keep rawText as a fallback.
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

// Maps every spelling we've seen to one standard unit name.
const UNITS: Record<string, string> = {
  cup: "cup", cups: "cup", c: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbs: "tbsp", tb: "tbsp", T: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", t: "tsp",
  ounce: "oz", ounces: "oz", oz: "oz",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  gram: "g", grams: "g", g: "g",
  kilogram: "kg", kilograms: "kg", kg: "kg",
  milliliter: "ml", milliliters: "ml", ml: "ml",
  liter: "l", liters: "l", l: "l",
  pinch: "pinch", pinches: "pinch", dash: "dash", dashes: "dash",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can", package: "package", packages: "package",
  stick: "stick", sticks: "stick", slice: "slice", slices: "slice",
  quart: "quart", quarts: "quart", pint: "pint", pints: "pint",
};

export function parseIngredient(rawText: string, position: number): Ingredient {
  // Turn "1½" into "1 1/2", and the special fraction slash "1⁄2" (or "1 ⁄ 2")
  // into a normal "1/2", so there's only one fraction format to handle.
  let text = rawText
    .replace(/(\d)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, whole, frac) => `${whole ? whole + " " : ""}${UNICODE_FRACTIONS[frac]}`)
    .replace(/(\d)\s*[⁄∕]\s*(\d)/g, "$1/$2");

  // Quantity: "1 1/2", "1/2", "1.5", "2", or a range like "2-3" (we keep the low end).
  // Order matters: try the longest form first, or "1/2" would match as just "1".
  const qtyMatch = text.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*[\d./]+)?\s*/);
  let quantity: number | null = null;
  if (qtyMatch) {
    quantity = qtyMatch[1]
      .split(/\s+/)
      .reduce((sum, part) => {
        if (part.includes("/")) {
          const [n, d] = part.split("/").map(Number);
          return sum + n / d;
        }
        return sum + Number(part);
      }, 0);
    quantity = Math.round(quantity * 1000) / 1000;
    text = text.slice(qtyMatch[0].length);
  }

  // Unit: the next word, if it's one we recognize. "tbsp." -> "tbsp"
  let unit: string | null = null;
  const unitMatch = text.match(/^([a-zA-Z]+)\.?\s+/);
  if (quantity !== null && unitMatch) {
    const word = unitMatch[1];
    const normalized = UNITS[word] ?? UNITS[word.toLowerCase()];
    if (normalized) {
      unit = normalized;
      text = text.slice(unitMatch[0].length);
    }
  }

  const name = text.replace(/^of\s+/i, "").trim() || rawText;
  return { position, quantity, unit, name, rawText };
}
