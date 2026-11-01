-- =============================================================================
-- Sign-up — how much does asking for an account cost us?
--
-- We ask for an account at the moment someone wants to share. That's a
-- deliberate trade-off: an account makes shares feel personal ("from Pratik's
-- cookbook"), but every extra step loses some people. These queries measure
-- how many.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The sign-up funnel, per user.
--    prompted → code sent → completed → actually shared
--    The biggest drop tells you which step to fix:
--      • prompted → code sent:  people don't want to give an email
--      • code sent → completed: emails are slow, in spam, or the code is fiddly
--      • completed → shared:    something broke after sign-up
-- -----------------------------------------------------------------------------
with per_user as (
  select
    user_id,
    min(created_at) filter (where event_name = 'signup_prompted')   as prompted_at,
    min(created_at) filter (where event_name = 'signup_code_sent')  as code_sent_at,
    min(created_at) filter (where event_name = 'signup_completed')  as completed_at,
    min(created_at) filter (where event_name = 'recipe_shared')     as first_shared_at
  from events
  group by user_id
)
select
  count(prompted_at)                                                   as "1_prompted",
  count(code_sent_at)                                                  as "2_code_sent",
  count(completed_at)                                                  as "3_completed",
  count(*) filter (where first_shared_at > completed_at)               as "4_shared_after_signup",
  round(100.0 * count(completed_at) / nullif(count(prompted_at), 0), 1) as signup_conversion_pct
from per_user
where prompted_at is not null;


-- -----------------------------------------------------------------------------
-- 2. How long does sign-up take? If the median is minutes, email delivery is
--    probably the problem, not the form.
-- -----------------------------------------------------------------------------
select
  count(*)                                                                          as signups,
  percentile_cont(0.5) within group (order by (properties->>'seconds_to_complete')::int) as median_seconds,
  percentile_cont(0.9) within group (order by (properties->>'seconds_to_complete')::int) as p90_seconds
from events
where event_name = 'signup_completed';


-- -----------------------------------------------------------------------------
-- 3. What goes wrong? Error codes are a fixed list, so they group cleanly.
-- -----------------------------------------------------------------------------
select
  properties->>'step'        as step,
  properties->>'error_code'  as error_code,
  count(*)                   as failures,
  count(distinct user_id)    as users_affected
from events
where event_name = 'signup_failed'
group by 1, 2
order by failures desc;


-- -----------------------------------------------------------------------------
-- 4. Did the account carry over the user's history?
--    Because we UPGRADE the anonymous user instead of creating a new one, a
--    user's events before and after sign-up share one user_id. This shows how
--    much a typical user did before we asked them to sign up.
-- -----------------------------------------------------------------------------
with signup as (
  select user_id, min(created_at) as signed_up_at
  from events
  where event_name = 'signup_completed'
  group by user_id
)
select
  s.user_id,
  count(*) filter (where e.created_at < s.signed_up_at and e.event_name = 'recipe_saved')  as recipes_saved_before_signup,
  count(*) filter (where e.created_at < s.signed_up_at)                                    as events_before_signup,
  (s.signed_up_at - min(e.created_at))                                                      as time_from_first_visit_to_signup
from signup s
join events e on e.user_id = s.user_id
group by s.user_id, s.signed_up_at;
