// Scaling a recipe up or down: "this serves 4, I'm feeding 6".
//
// This is where storing quantity / unit / name separately pays off. Because
// "1 ½ cups basmati rice" is stored as { quantity: 1.5, unit: "cup",
// name: "basmati rice" }, we can multiply 1.5 by 6/4 and rebuild the line as
// "2 ¼ cups basmati rice". With only the raw text, we couldn't.

import type { Ingredient } from "./recipe";

// The number of servings in a recipe's "servings" text, if there is one.
// "4" → 4, "Makes 12" → 12, "18 5-inch cookies" → 18, "a crowd" → null
export function baseServings(servings: string | null): number | null {
  const match = servings?.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return n >= 1 && n <= 200 ? n : null;
}

// The ingredient line to show at a given scale. At ×1 we always show the
// original wording exactly as written. Lines with no quantity ("Salt to
// taste") stay as they are at any scale.
export function scaledIngredientText(ing: Ingredient, factor: number): string {
  if (factor === 1 || ing.quantity === null) return ing.rawText;
  const amount = ing.quantity * factor;
  const unit = ing.unit ? ` ${unitLabel(ing.unit, amount)}` : "";
  return `${formatQuantity(amount, ing.unit)}${unit} ${ing.name}`;
}

// Cooks read "1 ⅓ cups", not "1.333 cups". Round to the nearest kitchen
// fraction (halves, thirds, quarters, eighths) when one is close.
const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
  [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"],
];

export function formatQuantity(amount: number, unit: string | null = null): string {
  // Grams and millilitres: whole numbers read best ("338 g", not "337 ½ g").
  if (unit === "g" || unit === "ml") return String(Math.round(amount));
  if (amount >= 10) return String(Math.round(amount * 2) / 2).replace(".5", " ½");

  const whole = Math.floor(amount);
  const rest = amount - whole;
  if (rest < 0.06) return String(whole || amount.toFixed(2));
  if (rest > 0.94) return String(whole + 1);

  const [value, symbol] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  if (Math.abs(value - rest) <= 0.05) return whole ? `${whole} ${symbol}` : symbol;
  return String(Math.round(amount * 10) / 10);
}

// "cup" → "cups" when there's more than one. Abbreviations (tbsp, g, oz)
// don't change.
const PLURALS: Record<string, string> = {
  cup: "cups", clove: "cloves", can: "cans", stick: "sticks", slice: "slices",
  package: "packages", pinch: "pinches", dash: "dashes", quart: "quarts", pint: "pints",
};

function unitLabel(unit: string, amount: number): string {
  return amount > 1 && PLURALS[unit] ? PLURALS[unit] : unit;
}
