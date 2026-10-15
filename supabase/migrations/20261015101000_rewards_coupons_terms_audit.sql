-- Applied to cxujipeulvhreiryaptr on 2026-10-15.
--
-- Coupons, terms acceptance, and the reward audit trail.

-- The offer itself. Per-person allocations live in reward_allocations with
-- type='coupon'; this is the thing being offered, and it records who is on
-- the hook to honour it. A coupon issued by a restaurant is that
-- restaurant's obligation, not STRIVUP's, and the record has to say so.
create table if not exists public.coupon_definitions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.reward_campaigns(id) on delete set null,
  business_id uuid references public.business_profiles(id) on delete set null,
  quest_id uuid references public.quests(id) on delete set null,
  title text not null,
  description text,
  discount_type text not null check (discount_type in ('percent','flat','freebie')),
  discount_value integer check (discount_value is null or discount_value > 0),
  min_purchase_minor integer check (min_purchase_minor is null or min_purchase_minor >= 0),
  terms text,
  redemption_instructions text,
  -- 'shared' issues one code to everyone; 'unique' mints one per person,
  -- which is what a single-use offer needs.
  code_strategy text not null default 'unique' check (code_strategy in ('unique','shared')),
  shared_code text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit integer not null default 1 check (per_user_limit > 0),
  status text not null default 'draft'
    check (status in ('draft','active','paused','expired','revoked')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_percent_range check (
    discount_type <> 'percent' or (discount_value between 1 and 100)
  ),
  constraint coupon_shared_has_code check (
    code_strategy <> 'shared' or shared_code is not null
  ),
  constraint coupon_dates check (expires_at is null or expires_at > starts_at)
);

create index if not exists idx_coupon_def_business on public.coupon_definitions (business_id, status);
create index if not exists idx_coupon_def_campaign on public.coupon_definitions (campaign_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reward_alloc_coupon_def_fk') then
    alter table public.reward_allocations
      add constraint reward_alloc_coupon_def_fk
      foreign key (coupon_definition_id) references public.coupon_definitions(id) on delete restrict;
  end if;
end $$;

-- The per-person code, unique where the offer says unique. This is what
-- stops one code being handed round.
create table if not exists public.coupon_codes (
  id uuid primary key default gen_random_uuid(),
  coupon_definition_id uuid not null references public.coupon_definitions(id) on delete cascade,
  allocation_id uuid unique references public.reward_allocations(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  unique (coupon_definition_id, code)
);

-- Opening a coupon is not redeeming it. A row here means somebody with the
-- authority to say so confirmed the offer was actually used.
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.reward_allocations(id) on delete restrict,
  coupon_definition_id uuid not null references public.coupon_definitions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  verified_by_business_id uuid references public.business_profiles(id) on delete set null,
  verified_by_user_id uuid references public.profiles(id) on delete set null,
  -- 'business' is a staff confirmation in the business console. 'qr' and
  -- 'admin' are recorded shapes for mechanisms that do not exist yet and
  -- must not be assumed to work.
  method text not null default 'business' check (method in ('business','qr','admin')),
  note text,
  redeemed_at timestamptz not null default now()
);

create index if not exists idx_coupon_redemptions_def on public.coupon_redemptions (coupon_definition_id);
create index if not exists idx_coupon_redemptions_user on public.coupon_redemptions (user_id);

-- One redemption per allocation, so a single-use coupon cannot be redeemed
-- twice even if two requests arrive together.
create unique index if not exists uq_coupon_redemption_per_allocation
  on public.coupon_redemptions (allocation_id);

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid references public.reward_campaigns(id) on delete cascade,
  rules_version_id uuid references public.campaign_rules_versions(id) on delete set null,
  document text not null default 'campaign_rules',
  accepted_at timestamptz not null default now(),
  unique (user_id, rules_version_id, document)
);

-- Every approval, rejection, revocation and payout confirmation, with the
-- human who did it. admin_actions already exists but is keyed to generic
-- entities; this keeps the money trail in one queryable place.
create table if not exists public.reward_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity text not null check (entity in (
    'campaign','rules_version','allocation','claim','payout','coupon_definition','coupon_redemption'
  )),
  entity_id uuid not null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reward_audit_entity on public.reward_audit_events (entity, entity_id, created_at desc);
