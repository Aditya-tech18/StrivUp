-- Applied to cxujipeulvhreiryaptr on 2026-10-15.
--
-- Rewards: campaigns, allocations, claims, payouts.
--
-- Reward definitions already exist in quest_rewards and this does not
-- duplicate them. What was missing is everything between "a definition
-- exists" and "a person was actually paid": who was found eligible, who
-- approved it, where the money went, and whether anyone confirmed it
-- arrived.
--
-- Money is in minor units (paise) as an integer, never a float.
--
-- The load-bearing line in this file is reward_campaigns_cash_requires_review.
-- Cash cannot be switched on by flipping one boolean: the campaign must be
-- approved AND carry a named reviewer AND a review timestamp. Verified by
-- supabase/tests/rewards_security_test.sql.

create table if not exists public.reward_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Null business_id means STRIVUP is the organiser. This matters: the
  -- organiser is who owes the prize.
  business_id uuid references public.business_profiles(id) on delete set null,
  -- Deliberately not free text. "loyalty" and "prize_competition" carry very
  -- different legal consequences and the difference must be recorded rather
  -- than implied.
  mechanic_type text not null default 'unclassified'
    check (mechanic_type in (
      'unclassified', 'loyalty', 'skill_competition', 'random_draw',
      'sweepstakes', 'purchase_linked_promotion', 'other'
    )),
  status text not null default 'draft'
    check (status in ('draft','pending_review','approved','suspended','ended')),
  cash_enabled boolean not null default false,
  compliance_reviewed_by uuid references public.profiles(id) on delete set null,
  compliance_reviewed_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Asia/Kolkata',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_campaigns_cash_requires_review check (
    cash_enabled = false
    or (status = 'approved'
        and compliance_reviewed_by is not null
        and compliance_reviewed_at is not null)
  ),
  constraint reward_campaigns_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists idx_reward_campaigns_status on public.reward_campaigns (status, cash_enabled);
create index if not exists idx_reward_campaigns_business on public.reward_campaigns (business_id);

-- Versioned public rules. The rules a user saw are pinned to the reward they
-- earned, so editing the rules later cannot retroactively change what
-- somebody was promised.
create table if not exists public.campaign_rules_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.reward_campaigns(id) on delete cascade,
  version integer not null,
  rules jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  approval_status text not null default 'draft'
    check (approval_status in ('draft','pending_review','approved','withdrawn')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);

create index if not exists idx_campaign_rules_campaign on public.campaign_rules_versions (campaign_id, version desc);

-- Legal review notes get their own table. RLS is row-level, so a "private"
-- column on a publicly readable row is not private at all; a separate
-- admin-only table is the only way to keep counsel's notes from users.
create table if not exists public.campaign_compliance_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.reward_campaigns(id) on delete cascade,
  rules_version_id uuid references public.campaign_rules_versions(id) on delete set null,
  note text not null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The UPI handle lives apart from rewards so that reading a reward never
-- reads a payment handle. Only the handle is stored: there is deliberately
-- no column that could hold a UPI PIN, an OTP or any payment authorisation
-- secret.
create table if not exists public.payout_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  method text not null default 'upi' check (method in ('upi')),
  upi_id text not null check (upi_id ~ '^[a-zA-Z0-9._\-]{2,64}@[a-zA-Z]{2,32}$'),
  label text,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payout_dest_user on public.payout_destinations (user_id);

-- One row per person per reward. Cash, coupons and badges share this table
-- because they share a lifecycle and the My Rewards screen reads them as one
-- list; the CHECKs keep a badge from carrying an amount and a cash row from
-- being amountless.
create table if not exists public.reward_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.reward_campaigns(id) on delete restrict,
  type text not null check (type in ('cash','coupon','badge')),
  source_quest_id uuid references public.quests(id) on delete set null,
  source_challenge_id uuid references public.challenges(id) on delete set null,
  quest_reward_id uuid references public.quest_rewards(id) on delete set null,
  amount_minor integer check (amount_minor is null or amount_minor > 0),
  currency text not null default 'INR' check (currency = upper(currency)),
  coupon_definition_id uuid,
  badge_code text,
  status text not null default 'pending_review' check (status in (
    'pending_review','approved','claim_required','processing','paid',
    'failed','rejected','expired','cancelled',
    'available','claimed','redeemed','revoked'
  )),
  -- What made this person eligible, recorded at allocation time rather than
  -- recomputed later, so an audit can see the basis for the decision.
  eligibility_basis jsonb not null default '{}'::jsonb,
  rules_version_id uuid references public.campaign_rules_versions(id) on delete set null,
  earned_at timestamptz not null default now(),
  approved_at timestamptz,
  claimed_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_alloc_one_source check (
    (source_quest_id is not null)::int + (source_challenge_id is not null)::int = 1
  ),
  constraint reward_alloc_cash_has_amount check (type <> 'cash' or amount_minor is not null),
  constraint reward_alloc_badge_has_code check (type <> 'badge' or badge_code is not null),
  constraint reward_alloc_badge_has_no_money check (type <> 'badge' or amount_minor is null),
  constraint reward_alloc_coupon_has_def check (type <> 'coupon' or coupon_definition_id is not null)
);

-- Duplicate prevention in the database rather than in whichever code path
-- happens to run first.
create unique index if not exists uq_reward_alloc_per_definition
  on public.reward_allocations (user_id, quest_reward_id)
  where quest_reward_id is not null;
create unique index if not exists uq_reward_alloc_badge
  on public.reward_allocations (user_id, badge_code)
  where badge_code is not null;
create index if not exists idx_reward_alloc_user on public.reward_allocations (user_id, status, earned_at desc);
create index if not exists idx_reward_alloc_campaign on public.reward_allocations (campaign_id, status);

-- One claim per allocation, enforced by a unique constraint rather than an
-- application check, so a double-tapped button cannot create two.
create table if not exists public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique references public.reward_allocations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payout_destination_id uuid references public.payout_destinations(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted','needs_info','accepted','rejected','cancelled')),
  rules_version_id uuid references public.campaign_rules_versions(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reward_claims_user on public.reward_claims (user_id, status);

-- "Paid" is not something an administrator can simply assert. A successful
-- payout needs a reference and a confirming human (later, a provider
-- webhook), and the idempotency key makes a retried request reuse the same
-- payout rather than create a second one.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.reward_claims(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'INR',
  -- 'manual' is the only method that exists today. The column is here so a
  -- provider can be added without a migration that rewrites history.
  provider text not null default 'manual' check (provider in ('manual')),
  reference text,
  status text not null default 'initiated'
    check (status in ('initiated','processing','succeeded','failed','cancelled')),
  failure_reason text,
  idempotency_key text not null unique,
  initiated_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_success_needs_evidence check (
    status <> 'succeeded'
    or (reference is not null and confirmed_by is not null and completed_at is not null)
  ),
  constraint payouts_failure_has_reason check (status <> 'failed' or failure_reason is not null)
);

create index if not exists idx_payouts_claim on public.payouts (claim_id);
create index if not exists idx_payouts_status on public.payouts (status, started_at desc);

-- Only one payout may be live or successful per claim. A failed attempt does
-- not block a retry, which is what the partial index says.
create unique index if not exists uq_payout_live_per_claim
  on public.payouts (claim_id)
  where status in ('initiated','processing','succeeded');
