-- =============================================================================
-- 008 — A public metrics dashboard
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- The queries in supabase/analysis/ only run in the SQL Editor, which sees
-- every row. The /metrics page needs the same numbers, but the browser can
-- only see your OWN events (row-level security).
--
-- get_metrics() bridges that gap the same way get_shared_recipe() does: it's
-- `security definer`, so it can read every event, but it only ever returns
-- AGGREGATES — counts, rates, medians. No user ids, emails, recipe titles or
-- URLs leave the database. That's the usual rule for public dashboards:
-- publish the numbers, never the rows.
--
-- Days are UTC days.
-- =============================================================================

create or replace function public.get_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  -- Each user's first event: when they arrived, and through which door.
  first_touch as (
    select distinct on (user_id)
      user_id, event_name, page_path, created_at as first_seen
    from events
    order by user_id, created_at
  ),

  -- ---- Activation & retention ---------------------------------------------
  -- Activated = saved a recipe within 24 hours of their first visit.
  -- Returning = active on 2 or more different days.
  per_user as (
    select
      f.user_id,
      f.first_seen,
      (f.event_name = 'share_link_opened' or f.page_path like '/s/%')          as via_share,
      exists (select 1 from events e
              where e.user_id = f.user_id and e.event_name = 'recipe_saved'
                and e.created_at < f.first_seen + interval '24 hours')         as activated,
      (select count(distinct e.created_at::date) from events e
        where e.user_id = f.user_id)                                           as active_days
    from first_touch f
  ),

  -- ---- Daily activity, last 30 days ---------------------------------------
  -- generate_series makes a row for EVERY day, so quiet days show as 0
  -- instead of silently disappearing from the chart.
  days as (
    select d::date as day
    from generate_series(current_date - 29, current_date, interval '1 day') d
  ),
  daily as (
    select
      d.day,
      count(distinct e.user_id)                                    as active_users,
      count(e.id) filter (where e.event_name = 'recipe_saved')     as recipes_saved
    from days d
    left join events e on e.created_at::date = d.day
    group by d.day
  ),

  -- ---- Add-a-recipe funnel, per session ------------------------------------
  add_sessions as (
    select
      session_id,
      bool_or(event_name = 'import_started')   as started,
      bool_or(event_name = 'import_succeeded') as succeeded,
      bool_or(event_name = 'recipe_saved')     as saved
    from events
    group by session_id
  ),

  -- ---- Share funnel, per share link ----------------------------------------
  -- Opens by the sharer themself don't count (is_owner = true).
  per_share as (
    select
      properties->>'share_id'                                                      as share_id,
      bool_or(event_name = 'recipe_shared')                                        as was_shared,
      count(distinct user_id) filter (where event_name = 'share_link_opened'
                                        and (properties->>'is_owner')::boolean = false) as friends_opened,
      count(distinct user_id) filter (where event_name = 'recipe_saved'
                                        and properties->>'import_method' = 'shared')    as friends_saved
    from events
    where properties ? 'share_id'
    group by 1
  ),

  -- ---- Sign-up funnel, per user -------------------------------------------
  signup as (
    select
      user_id,
      bool_or(event_name = 'signup_prompted')  as prompted,
      bool_or(event_name = 'signup_code_sent') as code_sent,
      bool_or(event_name = 'signup_completed') as completed
    from events
    group by user_id
  ),

  -- ---- Shopping-link click-through ----------------------------------------
  -- One "view" per (user, recipe, day), so one keen shopper clicking five
  -- links counts once.
  linked_recipes as (
    select distinct recipe_id::text as recipe_id from ingredients where link_url is not null
  ),
  link_views as (
    select distinct user_id, properties->>'recipe_id' as recipe_id, created_at::date as day
    from events
    where event_name = 'recipe_viewed'
       or (event_name = 'share_link_opened' and (properties->>'is_owner')::boolean = false)
  ),
  link_clicks as (
    select distinct user_id, properties->>'recipe_id' as recipe_id, created_at::date as day
    from events
    where event_name = 'ingredient_link_clicked'
  )

  select jsonb_build_object(
    'generatedAt', now(),

    'overview', jsonb_build_object(
      'users',             (select count(*) from first_touch),
      'weeklyActiveUsers', (select count(distinct user_id) from events where created_at > now() - interval '7 days'),
      'sessions',          (select count(distinct session_id) from events),
      'recipesSaved',      (select count(*) from events where event_name = 'recipe_saved'),
      'recipesCooked',     (select count(distinct properties->>'recipe_id') from events where event_name = 'cooking_started'),
      'recipesPosted',     (select count(*) from recipes where is_public)
    ),

    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                'day', day, 'activeUsers', active_users, 'recipesSaved', recipes_saved) order by day), '[]'::jsonb)
              from daily),

    'activation', (select jsonb_build_object(
        'newUsers',  count(*),
        'activated', count(*) filter (where activated),
        'returning', count(*) filter (where active_days >= 2))
      from per_user),

    'acquisition', (select jsonb_build_object(
        'direct',      count(*) filter (where not via_share),
        'friendShare', count(*) filter (where via_share))
      from per_user),

    'imports', jsonb_build_object(
      'succeeded',     (select count(*) from events where event_name = 'import_succeeded'),
      'failed',        (select count(*) from events where event_name = 'import_failed'),
      'medianSeconds', (select round((percentile_cont(0.5) within group (order by (properties->>'ms_elapsed')::int) / 1000)::numeric, 2)
                        from events where event_name = 'import_succeeded'),
      'p90Seconds',    (select round((percentile_cont(0.9) within group (order by (properties->>'ms_elapsed')::int) / 1000)::numeric, 2)
                        from events where event_name = 'import_succeeded'),
      -- Reasons are a fixed list (blocked, no_recipe_found…), never URLs.
      'failureReasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) order by n desc), '[]'::jsonb)
                         from (select properties->>'failure_reason' as reason, count(*) as n
                               from events where event_name = 'import_failed' group by 1) r)
    ),

    'addFunnel', (select jsonb_build_object(
        'started',   count(*) filter (where started),
        'gotRecipe', count(*) filter (where started and succeeded),
        'saved',     count(*) filter (where started and succeeded and saved))
      from add_sessions),

    'shareFunnel', (select jsonb_build_object(
        'shared',   count(*) filter (where was_shared),
        'opened',   count(*) filter (where was_shared and friends_opened > 0),
        'produced', count(*) filter (where was_shared and friends_saved > 0))
      from per_share),

    -- K-factor = referred users who saved something ÷ users who shared.
    'virality', jsonb_build_object(
      'sharers',         (select count(distinct user_id) from events where event_name = 'recipe_shared'),
      'referredSavers',  (select count(*) from per_user p
                          where p.via_share
                            and exists (select 1 from events e where e.user_id = p.user_id and e.event_name = 'recipe_saved'))
    ),

    'signupFunnel', (select jsonb_build_object(
        'prompted',  count(*) filter (where prompted),
        'codeSent',  count(*) filter (where prompted and code_sent),
        'completed', count(*) filter (where prompted and completed))
      from signup),

    'shopping', (select jsonb_build_object(
        'views',  count(*),
        'clicks', count(c.user_id))
      from link_views v
      join linked_recipes lr using (recipe_id)
      left join link_clicks c using (user_id, recipe_id, day))
  );
$$;

-- Anyone can see the dashboard, even without a session (it's for recruiters).
grant execute on function public.get_metrics() to anon, authenticated;
