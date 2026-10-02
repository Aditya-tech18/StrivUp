-- Dual OTP workflow: participant profile on lookup, plus a reject path.
-- Applied to cxujipeulvhreiryaptr. Additive and idempotent.
--
-- WHY A NEW FUNCTION NAME
-- business_lookup_order_code already existed with a narrower return type, and
-- a return type cannot be widened with CREATE OR REPLACE. Dropping it blocked
-- on a lock, so the richer version ships as business_lookup_order_detail and
-- the original is left in place, unused by the app.
--
-- WHAT THE BUSINESS CAN SEE
-- Public identity (name, username, avatar, member since) plus this
-- participant's progress on THIS quest. Deliberately excluded: email, phone,
-- and any activity on another business's quest. Enough to judge whether an
-- order is genuine, not a profile dossier.
--
-- Both functions re-check that the caller owns the quest, so a business can
-- only ever resolve codes issued against its own quests.

create or replace function public.business_lookup_order_detail(p_code text)
returns table (
  id uuid, quest_id uuid, quest_title text, task_id uuid, task_title text,
  user_id uuid, participant_name text, participant_username text,
  participant_avatar text, participant_since timestamptz,
  tasks_completed_here bigint, tasks_total_here bigint,
  verified_orders_here bigint, joined_quest_at timestamptz,
  order_code text, bill_code text, platform text, status text,
  issued_on date, expires_at timestamptz, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select
    v.id, v.quest_id, q.title, v.task_id, t.title,
    v.user_id, p.full_name, p.username, p.avatar_url, p.created_at,
    (select count(*) from public.quest_task_submissions s
      where s.quest_id = v.quest_id and s.user_id = v.user_id
        and s.verification_status = 'approved'),
    (select count(*) from public.quest_tasks qt where qt.quest_id = v.quest_id),
    (select count(*) from public.quest_order_verifications ov
      where ov.quest_id = v.quest_id and ov.user_id = v.user_id
        and ov.status = 'completed'),
    (select pa.joined_at from public.quest_participants pa
      where pa.quest_id = v.quest_id and pa.user_id = v.user_id),
    v.order_code, v.bill_code, v.platform, v.status,
    v.issued_on, v.expires_at, v.created_at
  from public.quest_order_verifications v
  join public.quests q       on q.id = v.quest_id
  join public.quest_tasks t  on t.id = v.task_id
  left join public.profiles p on p.id = v.user_id
  where upper(v.order_code) = upper(btrim(p_code))
    and q.creator_id = auth.uid()
  order by v.created_at desc
  limit 5;
$$;

-- Reject a code the business does not recognise.
--
-- Cancelling frees the participant's daily slot, so somebody rejected in error
-- can request a fresh code the same day instead of being locked out until
-- tomorrow. An order that was already verified cannot be rejected: its bill
-- code is out in the world by then and may already be written on a bill.
create or replace function public.business_reject_order_code(
  p_code text, p_reason text default null
)
returns public.quest_order_verifications
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_row  public.quest_order_verifications%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to reject orders' using errcode = '28000';
  end if;

  select v.* into v_row
    from public.quest_order_verifications v
    join public.quests q on q.id = v.quest_id
   where upper(v.order_code) = upper(btrim(p_code))
     and q.creator_id = v_user
     and v.status in ('code_issued', 'order_verified')
   order by v.created_at desc
   limit 1;

  if not found then
    raise exception 'No open verification found for that code' using errcode = 'P0002';
  end if;

  if v_row.status = 'order_verified' then
    raise exception 'That order was already verified and a bill code issued'
      using errcode = 'P0001';
  end if;

  update public.quest_order_verifications
     set status = 'cancelled', notes = coalesce(p_reason, notes)
   where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;

grant execute on function public.business_lookup_order_detail(text)     to authenticated;
grant execute on function public.business_reject_order_code(text, text) to authenticated;
