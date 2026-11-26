-- Use the same deadline for all entry points, including invite links.
create or replace function public.check_participation_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_time_at_join timestamptz := clock_timestamp();
  v_user uuid := auth.uid();
begin
  -- Existing policies authorize the caller. Only check deadlines on a self-join.
  if v_user is null or v_user is distinct from new.user_id then return new; end if;

  if tg_table_name = 'challenge_participants' then
    if exists (
      select 1 from public.challenges c
      where c.id = new.challenge_id
        and c.duration_days > 0
        and c.created_at + c.duration_days * interval '24 hours' <= current_time_at_join
    ) and not exists (
      select 1 from public.challenge_participants p
      where p.challenge_id = new.challenge_id and p.user_id = new.user_id
    ) then
      raise exception 'This challenge is closed to new members.';
    end if;
  else
    if exists (
      select 1 from public.quests q
      where q.id = new.quest_id
        and (
          q.quest_status in ('completed', 'expired', 'cancelled', 'archived')
          or coalesce(q.end_date, q.ends_at) <= current_time_at_join
          or coalesce(q.start_date, q.starts_at) > current_time_at_join
        )
    ) and not exists (
      select 1 from public.quest_participants p
      where p.quest_id = new.quest_id and p.user_id = new.user_id
    ) then
      raise exception 'This quest is not open to new members.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.check_participation_deadline() from public, anon, authenticated;

drop trigger if exists check_challenge_join_deadline on public.challenge_participants;
create trigger check_challenge_join_deadline before insert on public.challenge_participants
for each row execute function public.check_participation_deadline();

drop trigger if exists check_quest_join_deadline on public.quest_participants;
create trigger check_quest_join_deadline before insert on public.quest_participants
for each row execute function public.check_participation_deadline();

-- Serialize a new submission or order code against a concurrent membership deletion.
create or replace function public.lock_membership_for_participation_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if tg_table_name = 'business_verification_requests' then
    if v_user is null or v_user is distinct from new.participant_id or new.quest_id is null then return new; end if;
  elsif v_user is null or v_user is distinct from new.user_id then
    return new;
  end if;

  if tg_table_name = 'proof_submissions' then
    perform 1 from public.challenge_participants
    where challenge_id = new.challenge_id and user_id = v_user for key share;
    if not found then raise exception 'Join this challenge before submitting proof.'; end if;
  else
    perform 1 from public.quest_participants
    where quest_id = new.quest_id and user_id = v_user for key share;
    if not found then raise exception 'Join this quest before starting a task.'; end if;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_membership_for_participation_progress() from public, anon, authenticated;

drop trigger if exists lock_challenge_membership_for_proof on public.proof_submissions;
create trigger lock_challenge_membership_for_proof before insert on public.proof_submissions
for each row execute function public.lock_membership_for_participation_progress();

drop trigger if exists lock_quest_membership_for_submission on public.quest_task_submissions;
create trigger lock_quest_membership_for_submission before insert on public.quest_task_submissions
for each row execute function public.lock_membership_for_participation_progress();

drop trigger if exists lock_quest_membership_for_order on public.quest_order_verifications;
create trigger lock_quest_membership_for_order before insert on public.quest_order_verifications
for each row execute function public.lock_membership_for_participation_progress();

drop trigger if exists lock_quest_membership_for_legacy_order on public.business_verification_requests;
create trigger lock_quest_membership_for_legacy_order before insert on public.business_verification_requests
for each row execute function public.lock_membership_for_participation_progress();

-- A verification already read by a merchant cannot be revived after leave cancels it.
create or replace function public.prevent_cancelled_quest_order_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' and new.status in ('order_verified', 'completed') then
    raise exception 'This quest verification code has been cancelled.';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_cancelled_quest_order_confirmation() from public, anon, authenticated;

drop trigger if exists prevent_cancelled_quest_order_confirmation on public.quest_order_verifications;
create trigger prevent_cancelled_quest_order_confirmation before update of status on public.quest_order_verifications
for each row execute function public.prevent_cancelled_quest_order_confirmation();

-- Undo an accidental join. Evidence, verified orders and settled rewards are retained.
create or replace function public.leave_participation(p_kind text, p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_challenge_status text;
  v_quest record;
begin
  if v_user is null then
    raise exception 'Sign in to leave.' using errcode = '28000';
  end if;

  if p_kind = 'challenge' then
    select p.status into v_challenge_status
    from public.challenge_participants p
    where p.challenge_id = p_id and p.user_id = v_user
    for update of p;

    if not found then return 'left'; end if;

    if v_challenge_status = 'completed' or exists (
      select 1 from public.proof_submissions where challenge_id = p_id and user_id = v_user
    ) or exists (
      select 1 from public.quest_activity_progress where challenge_id = p_id and user_id = v_user
    ) then
      return 'has_progress';
    end if;

    delete from public.challenge_participants where challenge_id = p_id and user_id = v_user;
  elsif p_kind = 'quest' then
    select p.completed_at, p.verification_status, p.proof_media_url, q.proof_type into v_quest
    from public.quest_participants p join public.quests q on q.id = p.quest_id
    where p.quest_id = p_id and p.user_id = v_user
    for update of p;

    if not found then return 'left'; end if;

    perform 1 from public.quest_order_verifications
    where quest_id = p_id and user_id = v_user
    for update;

    if v_quest.proof_media_url is not null
      or (v_quest.proof_type is distinct from 'none' and (
        v_quest.completed_at is not null or v_quest.verification_status = 'approved'
      )) or exists (
        select 1 from public.quest_task_submissions where quest_id = p_id and user_id = v_user
      ) or exists (
        select 1 from public.quest_activity_progress where quest_id = p_id and user_id = v_user
      ) or exists (
        select 1 from public.quest_order_verifications
        where quest_id = p_id and user_id = v_user and status in ('order_verified', 'completed')
      ) or exists (
        select 1 from public.business_verification_requests
        where quest_id = p_id and participant_id = v_user and status in ('pending', 'approved', 'completed')
      ) then
      return 'has_progress';
    end if;

    update public.quest_order_verifications set status = 'cancelled'
    where quest_id = p_id and user_id = v_user and status = 'code_issued';

    delete from public.quest_participants where quest_id = p_id and user_id = v_user;
  else
    raise exception 'Unknown participation type.' using errcode = '22023';
  end if;

  if not found then raise exception 'Could not remove this membership.'; end if;
  return 'left';
end;
$$;

revoke all on function public.leave_participation(text, uuid) from public, anon;
grant execute on function public.leave_participation(text, uuid) to authenticated;
