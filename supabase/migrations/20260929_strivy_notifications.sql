-- ─────────────────────────────────────────────────────────────────────────────
-- STRIVY Phase 3: let STRIVY check-ins appear in Alerts, without spam.
--
-- NOT APPLIED. Written for review. Apply only after approval, to a branch or
-- staging project first. The app works without it: check-ins then stay inside
-- the Strivy panel, and STRIVY_NOTIFICATIONS_ENABLED must stay unset.
--
-- Why a migration is needed:
--   public.notifications has no INSERT policy (by design: every notification
--   is written by a SECURITY DEFINER function), its type CHECK constraint has
--   no STRIVY types, and it has no column to make a notification idempotent.
--
-- What it changes (additive only, idempotent):
--   1. notifications.dedupe_key text NULL            (new column)
--   2. unique index (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
--   3. notifications_type_check: existing 24 types + 4 strivy_* types
--   4. function strivy_emit_notifications(jsonb) SECURITY DEFINER,
--      executable by `authenticated` only
--
-- RLS: unchanged. Users still only SELECT/UPDATE their own rows; there is
-- still no INSERT policy. The function inserts only for auth.uid().
--
-- Rollback (safe, removes only STRIVY's additions):
--   drop function if exists public.strivy_emit_notifications(jsonb);
--   delete from public.notifications where type like 'strivy\_%';
--   alter table public.notifications drop constraint notifications_type_check;
--   alter table public.notifications add constraint notifications_type_check
--     check (type = any (array[ <the 24 original types below> ]));
--   drop index if exists public.notifications_user_dedupe_key;
--   alter table public.notifications drop column if exists dedupe_key;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notifications add column if not exists dedupe_key text;

create unique index if not exists notifications_user_dedupe_key
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- Re-create the type check with every type the live DB allows today, plus
-- STRIVY's four. (List re-copied from the live constraint on 2026-10-21.
-- Re-check it before applying: a type missing here would make the ALTER fail
-- on existing rows, or block that notification from then on.)
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'new_follower', 'proof_approved', 'proof_rejected', 'challenge_joined',
    'proof_removed', 'business_verification_approved',
    'business_verification_rejected', 'business_bill_code_generated',
    'quest_joined', 'quest_task_approved', 'quest_task_rejected',
    'quest_completed', 'quest_reward_earned', 'quest_reward_fulfilled',
    'follow_request', 'follow_accepted', 'challenge_completed',
    'proof_liked', 'proof_commented',
    'activity_synced', 'activity_goal_near', 'activity_task_completed',
    'activity_flagged', 'business_new_quest',
    -- STRIVY Phase 3
    'strivy_streak_milestone', 'strivy_streak_at_risk',
    'strivy_quest_deadline', 'strivy_inactivity'
  ]::text[])
);

-- Writes STRIVY check-ins for the calling user only.
--   p_items: [{type, dedupe_key, title, message,
--              related_challenge_id?, related_quest_id?}]  (max 2 used)
-- Returns the number of rows actually inserted.
create or replace function public.strivy_emit_notifications(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_type text;
  v_key text;
  v_title text;
  v_message text;
  v_challenge uuid;
  v_quest uuid;
  v_recent integer;
  v_inserted integer := 0;
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be an array' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) limit 2 loop
    -- Flood cap: at most 3 STRIVY notifications per user per 24 hours.
    select count(*) into v_recent
      from notifications
     where user_id = v_uid
       and type like 'strivy\_%'
       and created_at > now() - interval '24 hours';
    exit when v_recent >= 3;

    v_type    := v_item->>'type';
    v_key     := v_item->>'dedupe_key';
    v_title   := left(coalesce(v_item->>'title', ''), 80);
    v_message := left(coalesce(v_item->>'message', ''), 300);
    v_challenge := nullif(v_item->>'related_challenge_id', '')::uuid;
    v_quest     := nullif(v_item->>'related_quest_id', '')::uuid;

    continue when v_type not in (
      'strivy_streak_milestone', 'strivy_streak_at_risk',
      'strivy_quest_deadline', 'strivy_inactivity');
    continue when v_key is null or length(v_key) > 200 or v_title = '' or v_message = '';

    -- Links may only point at things this user has joined.
    continue when v_challenge is not null and not exists (
      select 1 from challenge_participants
       where challenge_id = v_challenge and user_id = v_uid);
    continue when v_quest is not null and not exists (
      select 1 from quest_participants
       where quest_id = v_quest and user_id = v_uid);

    insert into notifications
      (user_id, type, title, message, related_challenge_id, related_quest_id, dedupe_key)
    values
      (v_uid, v_type, v_title, v_message, v_challenge, v_quest, v_key)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.strivy_emit_notifications(jsonb) from public, anon;
grant execute on function public.strivy_emit_notifications(jsonb) to authenticated;
