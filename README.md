# Cookbook

A recipe app built around one frustration: finding a recipe on TikTok, clicking through to a site full of ads and life stories, copying it into a cluttered notes app, then digging for it again when a friend asks.

**Live app: https://recipe-cookbook-one.vercel.app**

Here you paste a link and get just the recipe, keep everything in one cookbook, and share it in one tap. It's built as a product data science project: every feature logs its own events, and the analysis is in SQL.

## What it does

- **Import from a link.** Reads the structured recipe data sites embed for search engines, so no ads or life stories. Ingredients are parsed into quantity, unit and name.
- **Write your own** recipes, or paste them from a notes app.
- **Cookbook with chapters**, plus a servings scaler that recalculates every ingredient.
- **Share by link.** Friends can open and save a recipe without an account; their copy remembers which share it came from.
- **Social profiles.** Post your own recipes, follow friends, see a feed, search recipes and people. Imported recipes always stay private, because they belong to their creators (the database enforces this).
- **Shopping links** on ingredients, with click tracking (the basis for affiliate revenue).
- **AI Kitchen.** Adapts a recipe to dietary needs (e.g. no onion, no garlic) or creates a new one, using Claude.

## The data side

| | |
|---|---|
| [`src/lib/analytics.ts`](src/lib/analytics.ts) | The tracking plan: every event and its properties, enforced by TypeScript |
| [`supabase/migrations/`](supabase/migrations) | The database schema, one numbered migration per change, with row-level security |
| [`supabase/analysis/`](supabase/analysis) | SQL for the core metrics: import success, time to recipe, funnels, K-factor, sign-up conversion, shopping-link click-through |
| [`supabase/scripts/merge_users.sql`](supabase/scripts/merge_users.sql) | Identity merge for users whose anonymous session was lost |

## Stack

Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Postgres, auth, row-level security), Claude API.

## Running it locally

1. Create a Supabase project, turn on anonymous sign-ins, and run the files in `supabase/migrations/` in order in the SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable key (and optionally an Anthropic API key for the AI Kitchen).
3. `npm install`, then `npm run dev`, and open http://localhost:3000.
