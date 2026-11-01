-- =============================================================================
-- Sharing & virality — the core loop of the product:
--
--     you share  →  a friend opens  →  the friend saves  →  the friend shares…
--
-- Run in Supabase: SQL Editor → paste → highlight one query → Run.
--
-- Always exclude is_owner = true from opens: you checking your own link is
-- not a friend opening it, and would make the numbers look better than they are.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The share funnel, per share link.
--    Of the links people sent, how many got opened by someone else, and how
--    many turned into a saved copy?
-- -----------------------------------------------------------------------------
with per_share as (
  select
    properties->>'share_id'                                                     as share_id,
    bool_or(event_name = 'recipe_shared')                                       as was_shared,
    count(distinct user_id) filter (where event_name = 'share_link_opened'
                                    and (properties->>'is_owner')::boolean = false) as friends_opened,
    count(distinct user_id) filter (where event_name = 'recipe_saved'
                                    and properties->>'import_method' = 'shared')    as friends_saved
  from events
  where properties ? 'share_id'          -- "?" = does the JSON have this key?
  group by 1
)
select
  count(*) filter (where was_shared)                                as links_shared,
  count(*) filter (where was_shared and friends_opened > 0)         as links_opened,
  count(*) filter (where was_shared and friends_saved > 0)          as links_that_produced_a_save,
  round(100.0 * count(*) filter (where was_shared and friends_opened > 0)
        / nullif(count(*) filter (where was_shared), 0), 1)        as open_rate_pct,
  round(100.0 * sum(friends_saved) filter (where was_shared)
        / nullif(sum(friends_opened) filter (where was_shared), 0), 1) as save_rate_of_openers_pct
from per_share;


-- -----------------------------------------------------------------------------
-- 2. How did each user first arrive?
--    A user's FIRST event tells us their acquisition channel: if it's
--    share_link_opened, a friend brought them in.
--    `distinct on (user_id) ... order by user_id, created_at` = "first row per user".
-- -----------------------------------------------------------------------------
with first_touch as (
  select distinct on (user_id)
    user_id,
    event_name,
    page_path,
    created_at
  from events
  order by user_id, created_at
)
select
  case when event_name = 'share_link_opened' or page_path like '/s/%'
       then 'friend_share' else 'direct' end  as acquisition_channel,
  count(*)                                    as users
from first_touch
group by 1;


-- -----------------------------------------------------------------------------
-- 3. Viral coefficient (K-factor), simplified.
--    K = new users who arrived via a share AND saved something
--        ÷ users who shared at least once.
--    K > 1 means each sharer brings in more than one active new user — the
--    product grows by itself. Most real products are well below 1; even
--    0.2–0.5 meaningfully lowers the cost of growth.
-- -----------------------------------------------------------------------------
with first_touch as (
  select distinct on (user_id) user_id, event_name, page_path
  from events
  order by user_id, created_at
),
referred_and_activated as (
  select distinct f.user_id
  from first_touch f
  join events e on e.user_id = f.user_id and e.event_name = 'recipe_saved'
  where f.event_name = 'share_link_opened' or f.page_path like '/s/%'
),
sharers as (
  select distinct user_id from events where event_name = 'recipe_shared'
)
select
  (select count(*) from sharers)                       as sharers,
  (select count(*) from referred_and_activated)        as referred_users_who_saved,
  round((select count(*) from referred_and_activated)::numeric
        / nullif((select count(*) from sharers), 0), 2) as k_factor;


-- -----------------------------------------------------------------------------
-- 4. Second-generation sharing: did any friend who received a recipe go on to
--    share something themselves? That's the loop actually looping.
--    Uses the recipes table (state), not events — saved_from_share_id tells us
--    which users got a recipe from a friend.
-- -----------------------------------------------------------------------------
select
  count(distinct r.owner_id)                                   as users_who_received_a_recipe,
  count(distinct r.owner_id) filter (where exists (
    select 1 from shares s where s.sharer_id = r.owner_id))    as who_then_shared_themselves
from recipes r
where r.saved_from_share_id is not null;
