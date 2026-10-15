-- Applied to cxujipeulvhreiryaptr on 2026-10-15.
--
-- RLS for the rewards tables.
--
-- The governing idea: a user may READ their own money and may write almost
-- nothing. There is deliberately NO insert or update policy on
-- reward_allocations, reward_claims or payouts for anybody, admins included,
-- so those tables are unreachable from the anon and authenticated roles
-- entirely. Every legitimate write goes through a SECURITY DEFINER function
-- with a narrow EXECUTE grant, the same pattern the activity system already
-- uses for ingest_activity_records.
--
-- "No policy" is not an oversight. With RLS on and no permissive policy for
-- a command, that command is denied to every non-superuser role, which is
-- exactly the intent for tables that decide who gets paid. Verified by
-- supabase/tests/rewards_security_test.sql.

alter table public.reward_campaigns          enable row level security;
alter table public.campaign_rules_versions   enable row level security;
alter table public.campaign_compliance_notes enable row level security;
alter table public.reward_allocations        enable row level security;
alter table public.reward_claims             enable row level security;
alter table public.payout_destinations       enable row level security;
alter table public.payouts                   enable row level security;
alter table public.coupon_definitions        enable row level security;
alter table public.coupon_codes              enable row level security;
alter table public.coupon_redemptions        enable row level security;
alter table public.terms_acceptances         enable row level security;
alter table public.reward_audit_events       enable row level security;

do $$ begin

if not exists (select 1 from pg_policies where schemaname='public' and tablename='reward_campaigns' and policyname='campaigns_public_read') then
  create policy "campaigns_public_read" on public.reward_campaigns
    for select using (
      status in ('approved','suspended','ended')
      or public.is_platform_admin(auth.uid())
      or business_id in (select bp.id from public.business_profiles bp where bp.id = business_id
                          and exists (select 1 from public.quests q where q.business_id = bp.id and q.creator_id = auth.uid()))
    );
end if;

-- Approved rules are public: a user must be able to read the terms that
-- applied to a reward they already hold. That is the point of versioning.
if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_rules_versions' and policyname='rules_public_read') then
  create policy "rules_public_read" on public.campaign_rules_versions
    for select using (approval_status = 'approved' or public.is_platform_admin(auth.uid()));
end if;

-- Counsel's notes are not user-facing.
if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_compliance_notes' and policyname='compliance_notes_admin') then
  create policy "compliance_notes_admin" on public.campaign_compliance_notes
    for all using (public.is_platform_admin(auth.uid()))
    with check (public.is_platform_admin(auth.uid()));
end if;

if not exists (select 1 from pg_policies where schemaname='public' and tablename='reward_allocations' and policyname='alloc_own_read') then
  create policy "alloc_own_read" on public.reward_allocations
    for select using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));
end if;

if not exists (select 1 from pg_policies where schemaname='public' and tablename='reward_claims' and policyname='claims_own_read') then
  create policy "claims_own_read" on public.reward_claims
    for select using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));
end if;

-- Strictly your own, and not readable by admins through RLS either. An
-- admin who needs to pay someone gets the handle from the payout function's
-- output, which is audited, rather than by browsing the table.
if not exists (select 1 from pg_policies where schemaname='public' and tablename='payout_destinations' and policyname='payout_dest_own_read') then
  create policy "payout_dest_own_read" on public.payout_destinations
    for select using (user_id = auth.uid());
end if;
if not exists (select 1 from pg_policies where schemaname='public' and tablename='payout_destinations' and policyname='payout_dest_own_insert') then
  create policy "payout_dest_own_insert" on public.payout_destinations
    for insert with check (user_id = auth.uid());
end if;
if not exists (select 1 from pg_policies where schemaname='public' and tablename='payout_destinations' and policyname='payout_dest_own_update') then
  create policy "payout_dest_own_update" on public.payout_destinations
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
end if;
if not exists (select 1 from pg_policies where schemaname='public' and tablename='payout_destinations' and policyname='payout_dest_own_delete') then
  create policy "payout_dest_own_delete" on public.payout_destinations
    for delete using (user_id = auth.uid());
end if;

-- Read your own. Marking a payout paid is a function call, never an UPDATE.
if not exists (select 1 from pg_policies where schemaname='public' and tablename='payouts' and policyname='payouts_own_read') then
  create policy "payouts_own_read" on public.payouts
    for select using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));
end if;

if not exists (select 1 from pg_policies where schemaname='public' and tablename='coupon_definitions' and policyname='coupon_def_public_read') then
  create policy "coupon_def_public_read" on public.coupon_definitions
    for select using (
      status = 'active'
      or public.is_platform_admin(auth.uid())
      or exists (select 1 from public.quests q
                  where q.business_id = coupon_definitions.business_id
                    and q.creator_id = auth.uid())
    );
end if;
if not exists (select 1 from pg_policies where schemaname='public' and tablename='coupon_definitions' and policyname='coupon_def_admin_write') then
  create policy "coupon_def_admin_write" on public.coupon_definitions
    for all using (public.is_platform_admin(auth.uid()))
    with check (public.is_platform_admin(auth.uid()));
end if;

-- Only the person the code was issued to. This is what stops one user
-- reading another's unclaimed code.
if not exists (select 1 from pg_policies where schemaname='public' and tablename='coupon_codes' and policyname='coupon_codes_own_read') then
  create policy "coupon_codes_own_read" on public.coupon_codes
    for select using (
      exists (select 1 from public.reward_allocations ra
               where ra.id = coupon_codes.allocation_id and ra.user_id = auth.uid())
      or public.is_platform_admin(auth.uid())
    );
end if;

-- The holder sees their own; the issuing business sees redemptions of its
-- own offers, and nothing about payouts.
if not exists (select 1 from pg_policies where schemaname='public' and tablename='coupon_redemptions' and policyname='coupon_redemption_read') then
  create policy "coupon_redemption_read" on public.coupon_redemptions
    for select using (
      user_id = auth.uid()
      or public.is_platform_admin(auth.uid())
      or exists (select 1 from public.coupon_definitions cd
                  join public.quests q on q.business_id = cd.business_id
                 where cd.id = coupon_redemptions.coupon_definition_id
                   and q.creator_id = auth.uid())
    );
end if;

if not exists (select 1 from pg_policies where schemaname='public' and tablename='terms_acceptances' and policyname='terms_own_read') then
  create policy "terms_own_read" on public.terms_acceptances
    for select using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));
end if;
if not exists (select 1 from pg_policies where schemaname='public' and tablename='terms_acceptances' and policyname='terms_own_insert') then
  create policy "terms_own_insert" on public.terms_acceptances
    for insert with check (user_id = auth.uid());
end if;

-- Admins only. A user's own history is surfaced on the reward detail screen,
-- not by reading the audit log.
if not exists (select 1 from pg_policies where schemaname='public' and tablename='reward_audit_events' and policyname='audit_admin_read') then
  create policy "audit_admin_read" on public.reward_audit_events
    for select using (public.is_platform_admin(auth.uid()));
end if;

end $$;
