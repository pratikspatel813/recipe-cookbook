"use client";

// A live dashboard of how the product is doing, built from the events table.
// Public on purpose: it's the "product data science" half of this project.
//
// Layout follows how a PM would read it, top to bottom:
//   1. Is anyone using it?            (overview, daily activity)
//   2. Does the core job work?        (import success, time to recipe, add funnel)
//   3. Does it grow by itself?        (share funnel, K-factor, acquisition)
//   4. What does asking for an account cost?  (sign-up funnel)
//   5. Could it make money?           (shopping-link click-through)

import { useEffect, useState } from "react";
import { getMetrics, pct, type Metrics } from "@/lib/metrics";

export default function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getMetrics().then(setM).catch((err) => {
      console.error(err);
      setFailed(true);
    });
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8">
      <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Live from the events table</p>
      <h1 className="font-display text-3xl">How the cookbook is doing</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Every feature logs its own events. These numbers are computed in Postgres from those events. Only
        totals and rates leave the database, never anyone&rsquo;s data.
      </p>

      {failed && <p className="py-14 text-center italic text-ink-soft">Couldn&rsquo;t load the metrics.</p>}
      {!m && !failed && <p className="py-14 text-center italic text-ink-soft">…</p>}
      {m && <Dashboard m={m} />}
    </main>
  );
}

function Dashboard({ m }: { m: Metrics }) {
  const imports = m.imports.succeeded + m.imports.failed;
  const kFactor = m.virality.sharers > 0 ? m.virality.referredSavers / m.virality.sharers : null;
  const usersArrived = m.acquisition.direct + m.acquisition.friendShare;

  return (
    <>
      {/* ---- 1. Usage ---------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="People" value={m.overview.users} />
        <Stat label="Active in the last 7 days" value={m.overview.weeklyActiveUsers} />
        <Stat label="Recipes saved" value={m.overview.recipesSaved} />
        <Stat label="Recipes cooked" value={m.overview.recipesCooked} note="ticked off an ingredient" />
        <Stat label="Recipes posted" value={m.overview.recipesPosted} />
        <Stat label="Visits" value={m.overview.sessions} note="30 min of inactivity ends one" />
      </div>

      <Section
        title="Daily active people"
        why="Anyone who did anything that day. The last 30 days, UTC."
      >
        <DailyChart daily={m.daily} />
      </Section>

      <Section
        title="Activation and retention"
        why="Activated = saved a recipe within 24 hours of arriving. Returning = came back on a second day. With a handful of friends, these are the earliest sign of whether it's useful."
      >
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Activated" value={pct(m.activation.activated, m.activation.newUsers)} unit="%"
                note={`${m.activation.activated} of ${m.activation.newUsers}`} />
          <Stat label="Returning" value={pct(m.activation.returning, m.activation.newUsers)} unit="%"
                note={`${m.activation.returning} of ${m.activation.newUsers}`} />
        </div>
      </Section>

      {/* ---- 2. The core job --------------------------------------------- */}
      <Section
        title="Importing from a link"
        why="The guardrail metric: if imports break, nothing else works. Time to recipe is the pitch: seconds instead of scrolling past ads."
      >
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Success rate" value={pct(m.imports.succeeded, imports)} unit="%"
                note={`${m.imports.succeeded} of ${imports}`} />
          <Stat label="Median time" value={m.imports.medianSeconds} unit="s" />
          <Stat label="Slowest 10%" value={m.imports.p90Seconds} unit="s" note="90th percentile" />
        </div>
        {m.imports.failureReasons.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 text-sm text-ink-soft">Why imports fail</h3>
            <Bars
              rows={m.imports.failureReasons.map((r) => ({
                label: FAILURE_LABELS[r.reason] ?? r.reason,
                value: r.count,
              }))}
            />
          </>
        )}
      </Section>

      <Section
        title="Add-a-recipe funnel"
        why="Per visit. A big drop at the last step means people see the recipe and don't think it's worth keeping."
      >
        <Funnel steps={[
          { label: "Pasted a link", value: m.addFunnel.started },
          { label: "Got a recipe back", value: m.addFunnel.gotRecipe },
          { label: "Saved it", value: m.addFunnel.saved },
        ]} />
      </Section>

      {/* ---- 3. Growth --------------------------------------------------- */}
      <Section
        title="Sharing"
        why="The growth loop: you share, a friend opens, the friend saves, the friend shares. Per link, and your own opens don't count."
      >
        <Funnel steps={[
          { label: "Links shared", value: m.shareFunnel.shared },
          { label: "Opened by a friend", value: m.shareFunnel.opened },
          { label: "Turned into a save", value: m.shareFunnel.produced },
        ]} />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="K-factor" value={kFactor === null ? null : Number(kFactor.toFixed(2))}
                note={`${m.virality.referredSavers} saving friends ÷ ${m.virality.sharers} sharers`} />
          <Stat label="Arrived through a friend" value={pct(m.acquisition.friendShare, usersArrived)} unit="%"
                note={`${m.acquisition.friendShare} of ${usersArrived}`} />
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          A K-factor above 1 means every sharer brings in more than one new person who saves something, so the
          app grows on its own. Most products are well below 1.
        </p>
      </Section>

      {/* ---- 4. Sign-up -------------------------------------------------- */}
      <Section
        title="Sign-up"
        why="You only need an account to share, post or follow. This shows what that ask costs: everyone who drops off here wanted to share and didn't."
      >
        <Funnel steps={[
          { label: "Asked to sign up", value: m.signupFunnel.prompted },
          { label: "Requested a code", value: m.signupFunnel.codeSent },
          { label: "Signed up", value: m.signupFunnel.completed },
        ]} />
      </Section>

      {/* ---- 5. Money ---------------------------------------------------- */}
      <Section
        title="Shopping links"
        why="Affiliate revenue = views × click-through × purchase rate × commission. The store sees purchases; we can measure the first two."
      >
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Click-through rate" value={pct(m.shopping.clicks, m.shopping.views)} unit="%"
                note={`${m.shopping.clicks} of ${m.shopping.views} views of recipes with links`} />
        </div>
      </Section>

      <p className="mt-10 text-center text-xs text-ink-soft">
        Updated {new Date(m.generatedAt).toLocaleString()} · SQL in{" "}
        <a className="underline" href="https://github.com/pratikspatel813/recipe-cookbook/tree/main/supabase">
          supabase/
        </a>
      </p>
    </>
  );
}

const FAILURE_LABELS: Record<string, string> = {
  blocked: "Site blocked us",
  fetch_failed: "Couldn't reach the site",
  no_recipe_found: "No recipe on the page",
  invalid_url: "Not a valid link",
};

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-ink-soft">{why}</p>
      {children}
    </section>
  );
}

// One number with a label. null shows as "—": no data yet is not the same as 0.
function Stat({ label, value, unit, note }: { label: string; value: number | null; unit?: string; note?: string }) {
  return (
    <div className="rounded-lg border border-rule bg-page px-4 py-3">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-sans text-2xl font-semibold">
        {value === null ? "—" : value.toLocaleString()}
        {value !== null && unit && <span className="text-base font-normal text-ink-soft">{unit}</span>}
      </p>
      {note && <p className="mt-0.5 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

// Horizontal bars, each scaled to the biggest value, with the number at the tip.
function Bars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm" title={`${r.label}: ${r.value}`}>
          <span className="text-ink-soft">{r.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-4 rounded-r bg-accent"
              style={{ width: `${(r.value / max) * 85}%`, minWidth: r.value > 0 ? 4 : 0 }}
            />
            <span className="font-sans tabular-nums">
              {r.value.toLocaleString()}
              {r.note && <span className="text-ink-soft"> · {r.note}</span>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// A funnel is bars where every step is a share of the FIRST step, so the
// percentages answer "of everyone who started, how many got this far?"
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = steps[0].value;
  return (
    <Bars
      rows={steps.map((s, i) => {
        const p = pct(s.value, first);
        return { label: s.label, value: s.value, note: i > 0 && p !== null ? `${p}%` : undefined };
      })}
    />
  );
}

// Daily active people as a line, with a hover readout for each day.
function DailyChart({ daily }: { daily: Metrics["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const W = 600, H = 160, padL = 28, padR = 8, padT = 10, padB = 22;
  const max = Math.max(1, ...daily.map((d) => d.activeUsers));
  const top = niceCeil(max);
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, daily.length - 1);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const line = daily.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.activeUsers)}`).join(" ");
  const area = `${line} L${x(daily.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = daily.length - 1;
  const h = hover ?? last;

  return (
    <div className="rounded-lg border border-rule bg-page p-3">
      <p className="mb-1 font-sans text-sm">
        <span className="font-semibold">{daily[h]?.activeUsers ?? 0}</span>{" "}
        <span className="text-ink-soft">
          active · {daily[h]?.recipesSaved ?? 0} saved · {formatDay(daily[h]?.day)}
        </span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`Daily active people over the last 30 days, peaking at ${max}`}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round(((px - padL) / (W - padL - padR)) * last);
          setHover(Math.min(last, Math.max(0, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {/* Gridlines at 0, half and the top: hairline, recessive. */}
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={1} />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-soft)" className="font-sans">
              {v}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Crosshair and marker for the hovered day (or today). */}
        <line x1={x(h)} x2={x(h)} y1={padT} y2={y(0)} stroke="var(--ink-soft)" strokeWidth={1} opacity={0.4} />
        <circle cx={x(h)} cy={y(daily[h]?.activeUsers ?? 0)} r={4.5} fill="var(--accent)" stroke="var(--page)" strokeWidth={2} />
        {/* First and last day on the x-axis. */}
        <text x={x(0)} y={H - 4} fontSize={11} fill="var(--ink-soft)" className="font-sans">{formatDay(daily[0]?.day)}</text>
        <text x={x(last)} y={H - 4} fontSize={11} fill="var(--ink-soft)" textAnchor="end" className="font-sans">Today</text>
      </svg>
      <button onClick={() => setShowTable(!showTable)} className="mt-1 text-xs text-ink-soft underline">
        {showTable ? "Hide" : "Show"} the numbers
      </button>
      {showTable && (
        <table className="mt-2 w-full font-sans text-xs tabular-nums">
          <thead className="text-left text-ink-soft">
            <tr><th className="py-1 font-normal">Day</th><th className="font-normal">Active</th><th className="font-normal">Saved</th></tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day} className="border-t border-rule">
                <td className="py-1">{formatDay(d.day)}</td><td>{d.activeUsers}</td><td>{d.recipesSaved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Round an axis top up to a clean number: 3 → 4, 7 → 8, 13 → 20.
function niceCeil(v: number): number {
  if (v <= 4) return Math.max(2, Math.ceil(v / 2) * 2);
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * step >= v) return m * step;
  return 10 * step;
}

// "2026-11-01" → "Nov 1". Parsed as UTC so the date doesn't shift a day in US time zones.
function formatDay(day?: string): string {
  if (!day) return "";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
