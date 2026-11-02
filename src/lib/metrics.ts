// The numbers behind /metrics, computed in the database by get_metrics()
// (supabase/migrations/008_metrics.sql). Only aggregates come back, never rows.

import { supabase } from "./supabase";

export type Metrics = {
  generatedAt: string;
  overview: {
    users: number;
    weeklyActiveUsers: number;
    sessions: number;
    recipesSaved: number;
    recipesCooked: number;
    recipesPosted: number;
  };
  daily: { day: string; activeUsers: number; recipesSaved: number }[];
  activation: { newUsers: number; activated: number; returning: number };
  acquisition: { direct: number; friendShare: number };
  imports: {
    succeeded: number;
    failed: number;
    medianSeconds: number | null;
    p90Seconds: number | null;
    failureReasons: { reason: string; count: number }[];
  };
  addFunnel: { started: number; gotRecipe: number; saved: number };
  shareFunnel: { shared: number; opened: number; produced: number };
  virality: { sharers: number; referredSavers: number };
  signupFunnel: { prompted: number; codeSent: number; completed: number };
  shopping: { views: number; clicks: number };
};

export async function getMetrics(): Promise<Metrics> {
  const { data, error } = await supabase.rpc("get_metrics");
  if (error) throw error;
  return data as Metrics;
}

// part ÷ whole as a whole-number percentage, or null when there's nothing to
// divide by. "—" on the page is more honest than a 0% that means "no data".
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((100 * part) / whole) : null;
}
