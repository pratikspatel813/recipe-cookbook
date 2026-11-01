// The dietary restrictions the AI Kitchen offers as tap-to-select chips.
// Shared by the page (labels) and the server (the exact wording sent to Claude),
// so the two can never drift apart. The ids are what analytics records.

export const RESTRICTIONS = {
  no_onion: { label: "No onion", prompt: "No onion of any kind (including shallots, leeks, scallions, chives, onion powder)" },
  no_garlic: { label: "No garlic", prompt: "No garlic of any kind (including garlic powder and garlic salt)" },
  vegetarian: { label: "Vegetarian", prompt: "Vegetarian: no meat, poultry, or seafood" },
  vegan: { label: "Vegan", prompt: "Vegan: no animal products at all" },
  gluten_free: { label: "Gluten-free", prompt: "Gluten-free" },
  dairy_free: { label: "Dairy-free", prompt: "Dairy-free" },
  nut_free: { label: "Nut-free", prompt: "No nuts or peanuts (allergy, so strict)" },
  egg_free: { label: "Egg-free", prompt: "No eggs" },
  low_sodium: { label: "Low sodium", prompt: "Low sodium" },
} as const;

export type RestrictionId = keyof typeof RESTRICTIONS;
