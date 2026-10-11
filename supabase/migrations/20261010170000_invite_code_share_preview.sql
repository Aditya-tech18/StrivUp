-- Applied to cxujipeulvhreiryaptr on 2026-10-10.
--
-- get_invite_preview(code) — what a shared invite link is allowed to show.
--
-- Invite links are the share mechanism: the link people actually paste into a
-- WhatsApp group is /join/<code>, not /challenges/<id>. For the preview card
-- to render, something has to resolve that code to a title, a cover and an
-- organizer before anyone has signed in.
--
-- RLS cannot do it. The SELECT policy on challenges is
--   visibility = 'public' OR creator_id = auth.uid() OR is_challenge_participant(...)
-- and an invite exists precisely for the case where none of those hold: a
-- private challenge, an anonymous visitor. So this is SECURITY DEFINER, with
-- the invite code itself as the capability. Holding the code is what grants
-- the preview, which is the same bargain the join function already makes.
--
-- It returns only what the card shows. No invite_code, no creator_id, no
-- description, no participant identities: a leaked code should expose the
-- poster, not the roster. An unknown code returns no rows, so a wrong code
-- and a deleted challenge are indistinguishable to a caller probing for
-- valid codes.
create or replace function public.get_invite_preview(p_code text)
returns table (
  challenge_id uuid,
  title text,
  thumbnail_url text,
  created_at timestamptz,
  duration_days int,
  organizer_name text,
  organizer_avatar_url text,
  participant_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id,
         c.title,
         c.thumbnail_url,
         c.created_at,
         c.duration_days,
         coalesce(p.full_name, '@' || p.username),
         p.avatar_url,
         (select count(*) from challenge_participants cp where cp.challenge_id = c.id)
  from challenges c
  left join profiles p on p.id = c.creator_id
  where c.invite_code = upper(btrim(p_code))
  limit 1;
$$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
