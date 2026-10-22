-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20261021_challenge_stakes.sql
-- Project:   cxujipeulvhreiryaptr (striv-mvp)
--
-- Written against the LIVE schema (see AGENTS.md). Idempotent.
--
-- ═══ DAILY STAKE — DESIGN CONTRACT ══════════════════════════════════════════
--
-- A challenge may put StrivCoins at risk each day. Miss a day, the coins are
-- BURNED. Finish the challenge, StrivUp MINTS a bonus.
--
-- WHY BURN AND MINT RATHER THAN TRANSFER.
--
-- The obvious version of this feature pays the people who showed up out of the
-- coins lost by the people who did not. That is a pooled wager, and it is
-- barred twice over:
--
--   1. The Promotion and Regulation of Online Gaming Act, 2025 (in force
--      1 May 2026) prohibits "online money games" — games where users pay a
--      stake expecting monetary gain — and says so regardless of whether the
--      game is skill or chance. StrivCoin is not money (see rules below), but
--      a redistribution pool is the exact shape the Act describes, and the
--      safe distance to keep from it is "no pool at all".
--
--   2. The StrivCoin contract in 20260928_strivcoin.sql already forbids
--      user-to-user transfer outright. Paying one participant from another's
--      balance would break it.
--
-- So: forfeits go nowhere, bonuses come from nowhere. Loss aversion is fully
-- intact — missing a day still costs you — but there is no counterparty, no
-- pot, and nothing winnable that anyone could value in rupees.
--
-- The three StrivCoin rules continue to hold without amendment: coins are
-- earned only and never purchased, never cashable and never transferable, and
-- buy only zero-cost goods. A stake neither buys nor sells anything; it
-- destroys and creates coins inside a closed loyalty system.
--
-- ═══ SETTLEMENT ═════════════════════════════════════════════════════════════
--
-- Settlement is a daily job, not a trigger, because the fact being settled is
-- an ABSENCE — no approved proof for a date — and absences do not raise
-- events. It runs from the existing Vercel cron at 03:00 UTC, which is 08:30
-- IST, comfortably after the IST day it settles has closed.
--
-- Idempotency is structural, not defensive: every forfeit carries
-- dedupe_key = '<challenge_id>:<date>' against the existing unique index
-- (user_id, reason, dedupe_key). Running the job twice for the same date
-- cannot double-charge anyone, which matters because cron retries exist.
--
-- A balance can never go negative. The forfeit is clamped to what the user
-- actually holds, so the worst case is a balance of zero.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. The stake lives on the challenge ─────────────────────────────────────
-- Chosen once by the creator, identical for everyone who joins, so nobody can
-- be in the same challenge on different terms.
alter table public.challenges
  add column if not exists daily_stake integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'challenges_daily_stake_check'
  ) then
    alter table public.challenges
      add constraint challenges_daily_stake_check
      -- Capped at 25. A cap is the difference between a commitment device and
      -- a way to lose everything on one bad week: a user earning ~6 coins a
      -- day cannot dig a hole they could never climb out of.
      check (daily_stake >= 0 and daily_stake <= 25);
  end if;
end $$;

comment on column public.challenges.daily_stake is
  'StrivCoins burned for each day a participant misses. 0 = no stake. Never paid to another user.';

-- ── 2. Ledger vocabulary ────────────────────────────────────────────────────
-- Two new reasons. Keeping them distinct from spend_* matters: a spend buys
-- something, a forfeit buys nothing, and the coin history screen should never
-- tell a user they "purchased" a day they missed.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'striv_coin_ledger_reason_check'
  ) then
    alter table public.striv_coin_ledger drop constraint striv_coin_ledger_reason_check;
  end if;

  alter table public.striv_coin_ledger
    add constraint striv_coin_ledger_reason_check
    check (reason = any (array[
      'daily_checkin', 'proof_approved', 'challenge_joined', 'challenge_completed',
      'quest_joined', 'quest_completed',
      'spend_streak_freeze', 'spend_cosmetic', 'spend_challenge_boost',
      'stake_forfeit', 'stake_bonus',
      'adjustment'
    ]));
end $$;

-- ── 3. Settlement ───────────────────────────────────────────────────────────
create or replace function public.settle_challenge_stakes(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_date date;
  v_burned integer := 0;
  v_users integer := 0;
  r record;
  v_balance integer;
  v_take integer;
begin
  -- Default to yesterday in IST. The job runs in the morning; the day it can
  -- honestly judge is the one that has finished.
  v_date := coalesce(p_date, ((now() at time zone 'Asia/Kolkata')::date - 1));

  for r in
    select cp.user_id, c.id as challenge_id, c.daily_stake
    from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    where c.daily_stake > 0
      -- Joined on or before the day being settled: nobody is charged for days
      -- that passed before they were in the challenge.
      and (cp.joined_at at time zone 'Asia/Kolkata')::date <= v_date
      -- Still running on that day. A challenge with no duration runs until the
      -- participant leaves, so duration_days IS NULL never expires.
      and (
        c.duration_days is null
        or v_date < (cp.joined_at at time zone 'Asia/Kolkata')::date + c.duration_days
      )
      -- The absence itself: no approved proof bucketed to that IST date.
      and not exists (
        select 1 from proof_submissions ps
        where ps.challenge_id = c.id
          and ps.user_id = cp.user_id
          and ps.verification_status = 'approved'
          and (ps.submitted_at at time zone 'Asia/Kolkata')::date = v_date
      )
  loop
    select coalesce(sum(delta), 0) into v_balance
    from striv_coin_ledger where user_id = r.user_id;

    -- Clamped: a balance can never go negative, so a user who has nothing
    -- loses nothing. The streak break is punishment enough at zero.
    v_take := least(r.daily_stake, greatest(v_balance, 0));
    if v_take <= 0 then
      continue;
    end if;

    begin
      insert into striv_coin_ledger (user_id, delta, reason, dedupe_key, challenge_id)
      values (r.user_id, -v_take, 'stake_forfeit',
              r.challenge_id::text || ':' || v_date::text, r.challenge_id);
      v_burned := v_burned + v_take;
      v_users := v_users + 1;
    exception when unique_violation then
      -- Already settled for this challenge and date. Expected on a cron retry.
      null;
    end;
  end loop;

  return jsonb_build_object('date', v_date, 'coins_burned', v_burned, 'users_charged', v_users);
end $$;

revoke all on function public.settle_challenge_stakes(date) from public, anon, authenticated;

comment on function public.settle_challenge_stakes(date) is
  'Burns the daily stake for every participant who had no approved proof on p_date (IST). Idempotent per (challenge, date). Service role only.';

-- ── 4. Completion bonus ─────────────────────────────────────────────────────
-- Minted by StrivUp, never taken from another participant.
create or replace function public.award_stake_completion_bonus(
  p_user_id uuid,
  p_challenge_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_stake integer;
  v_days integer;
  v_approved integer;
  v_bonus integer;
begin
  select daily_stake, duration_days into v_stake, v_days
  from challenges where id = p_challenge_id;

  if v_stake is null or v_stake = 0 or v_days is null then
    return 0;
  end if;

  select count(*) into v_approved
  from proof_submissions
  where challenge_id = p_challenge_id
    and user_id = p_user_id
    and verification_status = 'approved';

  -- The bonus is earned by finishing, not by entering: it requires at least
  -- 80% of the days actually proved. Without that floor, a participant could
  -- join a staked challenge, never show up, lose nothing once their balance
  -- hit zero, and still collect.
  if v_approved::numeric / greatest(v_days, 1) < 0.8 then
    return 0;
  end if;

  -- Half the total possible stake. Enough to make finishing feel paid, never
  -- so much that a staked challenge out-earns ordinary daily activity.
  v_bonus := greatest(1, (v_stake * v_days) / 2);

  begin
    insert into striv_coin_ledger (user_id, delta, reason, dedupe_key, challenge_id)
    values (p_user_id, v_bonus, 'stake_bonus', p_challenge_id::text, p_challenge_id);
  exception when unique_violation then
    return 0;
  end;

  return v_bonus;
end $$;

revoke all on function public.award_stake_completion_bonus(uuid, uuid) from public, anon, authenticated;

comment on function public.award_stake_completion_bonus(uuid, uuid) is
  'Mints the completion bonus for a staked challenge. Requires 80% approved days. Idempotent per (user, challenge). Service role only.';

commit;

notify pgrst, 'reload schema';
