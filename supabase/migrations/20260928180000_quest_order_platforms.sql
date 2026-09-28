-- Ordering channels a Quest's tasks are fulfilled through. Applied to
-- cxujipeulvhreiryaptr. Additive and idempotent.
--
-- Stored as data rather than hardcoded chips in the component: which platforms
-- a business is on varies per business, and STRIVUP has no integration with any
-- of them — these are labels and outbound links the participant taps to go and
-- order. Shape: [{"platform":"zomato","label":"Zomato","url":"https://..."}]
alter table public.quests
  add column if not exists order_platforms jsonb;

comment on column public.quests.order_platforms is
  'Ordering channels for order_verification tasks: [{platform,label,url}]. Labels/links only — no platform API integration.';
