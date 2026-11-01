-- =============================================================================
-- Core metrics — run any query in Supabase: SQL Editor → paste → highlight
-- the one query you want → Run. (The SQL Editor sees every user's data.)
--
-- Useful Postgres for these queries:
--   properties->>'domain'        pull a text field out of the JSON
--   (properties->>'ms_elapsed')::int   …and convert it to a number
--   count(*) filter (where ...)  count only the rows matching a condition
--   percentile_cont(0.5) within group (order by x)   the median of x
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Sanity check: ALWAYS look at the raw data before trusting any metric.
--    Events per day by name. Look for gaps, sudden spikes (duplicates?),
--    or events you expected but don't see (broken tracking?).
-- -----------------------------------------------------------------------------
select
  date_trunc('day', created_at)::date as day,
  event_name,
  count(*)                            as events,
  count(distinct user_id)             as users
from events
group by 1, 2
order by 1 desc, 3 desc;


-- -----------------------------------------------------------------------------
-- 1. Import success rate — our GUARDRAIL metric.
--    If imports break, nothing else in the product works.
-- -----------------------------------------------------------------------------
select
  count(*) filter (where event_name = 'import_succeeded')                       as succeeded,
  count(*) filter (where event_name = 'import_failed')                          as failed,
  round(100.0 * count(*) filter (where event_name = 'import_succeeded')
        / nullif(count(*), 0), 1)                                               as success_rate_pct
from events
where event_name in ('import_succeeded', 'import_failed');
-- nullif(x, 0) turns 0 into null, so an empty table gives null instead of a
-- divide-by-zero error.


-- -----------------------------------------------------------------------------
-- 2. Which sites fail, and why? Tells us which fallback to build next.
-- -----------------------------------------------------------------------------
select
  properties->>'domain'          as domain,
  properties->>'failure_reason'  as failure_reason,
  count(*)                       as failures,
  count(distinct user_id)        as users_affected
from events
where event_name = 'import_failed'
group by 1, 2
order by failures desc;


-- -----------------------------------------------------------------------------
-- 3. Time to recipe. Our pitch: seconds here vs. ~2 minutes of ad-dodging.
--    We report the median AND the 90th percentile: the average hides slow
--    outliers, and the slow 10% is what frustrated users remember.
-- -----------------------------------------------------------------------------
select
  count(*)                                                                         as imports,
  round((percentile_cont(0.5) within group (order by (properties->>'ms_elapsed')::int) / 1000)::numeric, 2) as median_seconds,
  round((percentile_cont(0.9) within group (order by (properties->>'ms_elapsed')::int) / 1000)::numeric, 2) as p90_seconds
from events
where event_name = 'import_succeeded';


-- -----------------------------------------------------------------------------
-- 4. The add-recipe funnel, per session.
--    Of the sessions that started an import, how many got a recipe back, and
--    how many saved it? A big drop between steps 2 and 3 would mean people
--    see the recipe and decide it's not worth keeping — or the save button
--    is hard to find.
-- -----------------------------------------------------------------------------
with sessions as (
  select
    session_id,
    bool_or(event_name = 'import_started')   as started,
    bool_or(event_name = 'import_succeeded') as succeeded,
    bool_or(event_name = 'recipe_saved')     as saved
  from events
  group by session_id
)
select
  count(*) filter (where started)                                as "1_started_import",
  count(*) filter (where started and succeeded)                  as "2_got_recipe",
  count(*) filter (where started and succeeded and saved)        as "3_saved_recipe",
  round(100.0 * count(*) filter (where started and succeeded and saved)
        / nullif(count(*) filter (where started), 0), 1)        as overall_conversion_pct
from sessions;


-- -----------------------------------------------------------------------------
-- 5. Do people actually COOK what they save?
--    cooking_started (ticking an ingredient) is a "proxy metric": we can't
--    see someone cook, but checking off ingredients is close. Per recipe.
-- -----------------------------------------------------------------------------
select
  count(distinct properties->>'recipe_id') filter (where event_name = 'recipe_saved')     as recipes_saved,
  count(distinct properties->>'recipe_id') filter (where event_name = 'cooking_started')  as recipes_cooked,
  round(100.0 * count(distinct properties->>'recipe_id') filter (where event_name = 'cooking_started')
        / nullif(count(distinct properties->>'recipe_id') filter (where event_name = 'recipe_saved'), 0), 1)
                                                                                          as cooked_pct
from events;


-- -----------------------------------------------------------------------------
-- 6. Weekly active users and engagement depth.
--    "Active" = did anything at all that week.
-- -----------------------------------------------------------------------------
select
  date_trunc('week', created_at)::date                                        as week,
  count(distinct user_id)                                                     as weekly_active_users,
  count(*) filter (where event_name = 'recipe_saved')                         as recipes_saved,
  round(count(*) filter (where event_name = 'recipe_saved')::numeric
        / nullif(count(distinct user_id), 0), 2)                              as saves_per_active_user
from events
group by 1
order by 1 desc;
