-- Applied to cxujipeulvhreiryaptr on 2026-10-10.
--
-- get_profile_suggestions — who to show in the "people to follow" rail.
--
-- SECURITY DEFINER because the ranking counts participation across other
-- people's rows, which the caller cannot select directly. It returns only
-- what the card draws, never a private detail.
--
-- Ranking, in order: interests in common with the viewer, then finished
-- challenges and quests, then joined ones, then followers. Anyone the viewer
-- already follows, has blocked, or who has blocked them is excluded, as is
-- anyone deactivated or suspended.
--
-- Both completed and joined counts are returned. On a young account every
-- completed count is 0, and a card reading "0 challenges, 0 quests" is an
-- argument against tapping; joined lets the card say what someone is doing
-- now when they have not finished anything yet.
create or replace function public.get_profile_suggestions(p_limit int default 12)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  bio text,
  challenges_completed bigint,
  quests_completed bigint,
  challenges_joined bigint,
  quests_joined bigint,
  follower_count bigint,
  shared_interests bigint
)
language sql
security definer
stable
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  my_interests as (
    select interest_id from user_interests, me where user_id = me.uid
  ),
  candidate as (
    select p.id, p.username, p.full_name, p.avatar_url, p.bio, p.created_at,
           (select count(*) from challenge_participants cp
             where cp.user_id = p.id and cp.status = 'completed') as ch_done,
           (select count(*) from quest_participants qp
             where qp.user_id = p.id and qp.completed_at is not null) as q_done,
           (select count(*) from challenge_participants cp
             where cp.user_id = p.id) as ch_joined,
           (select count(*) from quest_participants qp
             where qp.user_id = p.id) as q_joined,
           (select count(*) from followers f
             where f.followed_id = p.id
               and coalesce(f.request_status, 'accepted') = 'accepted') as followers,
           (select count(*) from user_interests ui
             where ui.user_id = p.id
               and ui.interest_id in (select interest_id from my_interests)) as shared
      from profiles p, me
     where p.id <> me.uid
       and coalesce(p.is_deactivated, false) = false
       and coalesce(p.account_status, 'active') = 'active'
       and not exists (select 1 from followers f
                        where f.follower_id = me.uid and f.followed_id = p.id)
       and not exists (select 1 from user_blocks b
                        where (b.blocker_id = me.uid and b.blocked_id = p.id)
                           or (b.blocker_id = p.id and b.blocked_id = me.uid))
  )
  select id, username, full_name, avatar_url, bio,
         ch_done, q_done, ch_joined, q_joined, followers, shared
    from candidate
   order by shared desc,
            (ch_done + q_done) desc,
            (ch_joined + q_joined) desc,
            followers desc,
            created_at desc
   limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.get_profile_suggestions(int) from public;
grant execute on function public.get_profile_suggestions(int) to authenticated;

-- remove_follower(follower_id) — "remove this person from my followers".
--
-- The DELETE policy on followers is (follower_id = auth.uid()): you may undo
-- your own follow. Removing a follower is the opposite edge, owned by
-- someone else, so RLS cannot express it and the action had no way to work.
--
-- SECURITY DEFINER, scoped so the caller can only ever delete rows where
-- they are the followed party. It cannot be used to unfollow on someone
-- else's behalf.
--
-- Idempotent: removing someone who is not a follower deletes nothing and
-- reports success, so a double tap is not an error.
create or replace function public.remove_follower(p_follower_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.followers
   where follower_id = p_follower_id
     and followed_id = auth.uid();
$$;

revoke all on function public.remove_follower(uuid) from public;
grant execute on function public.remove_follower(uuid) to authenticated;
