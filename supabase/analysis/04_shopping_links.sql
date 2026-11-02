-- =============================================================================
-- Shopping links — would affiliate links make money?
--
-- Affiliate revenue = views × click-through rate × purchase rate × commission.
-- We can't see purchases (the store knows those), but we CAN measure the first
-- two. Click-through rate (CTR) is the number that decides whether this is
-- worth building into a real business.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. How many recipes and ingredients have links at all? (State, not events.)
--    If almost nobody adds links, CTR doesn't matter yet: the problem is supply.
-- -----------------------------------------------------------------------------
select
  count(distinct r.id)                                          as recipes,
  count(distinct r.id) filter (where i.link_url is not null)    as recipes_with_links,
  count(*) filter (where i.link_url is not null)                as linked_ingredients,
  round(100.0 * count(*) filter (where i.link_url is not null) / nullif(count(*), 0), 1) as pct_ingredients_linked
from recipes r
join ingredients i on i.recipe_id = r.id;


-- -----------------------------------------------------------------------------
-- 2. Click-through rate on recipes that HAVE links, split by surface.
--    CTR = views that led to at least one link click ÷ views.
--    Counted per (user, recipe, day) so one person clicking five links on one
--    visit counts once — otherwise a single keen shopper inflates the rate.
-- -----------------------------------------------------------------------------
with linked_recipes as (
  select distinct recipe_id::text as recipe_id from ingredients where link_url is not null
),
views as (
  select distinct
    user_id,
    properties->>'recipe_id'                                                    as recipe_id,
    created_at::date                                                            as day,
    case when event_name = 'share_link_opened' then 'shared_page' else 'own_recipe' end as surface
  from events
  where event_name = 'recipe_viewed'
     or (event_name = 'share_link_opened' and (properties->>'is_owner')::boolean = false)
),
clicks as (
  select distinct user_id, properties->>'recipe_id' as recipe_id, created_at::date as day, properties->>'surface' as surface
  from events
  where event_name = 'ingredient_link_clicked'
)
select
  v.surface,
  count(*)                     as views_of_linked_recipes,
  count(c.user_id)             as views_with_a_click,
  round(100.0 * count(c.user_id) / nullif(count(*), 0), 1) as ctr_pct
from views v
join linked_recipes lr using (recipe_id)
left join clicks c using (user_id, recipe_id, day, surface)
group by v.surface;


-- -----------------------------------------------------------------------------
-- 3. Which ingredients and stores get clicked? Tells a creator which links to
--    prioritize — and tells us which stores' affiliate programs to join first.
-- -----------------------------------------------------------------------------
select
  properties->>'link_domain'      as store,
  properties->>'ingredient_name'  as ingredient,
  count(*)                        as clicks,
  count(distinct user_id)         as people
from events
where event_name = 'ingredient_link_clicked'
group by 1, 2
order by clicks desc
limit 20;
