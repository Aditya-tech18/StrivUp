-- Applied to cxujipeulvhreiryaptr on 2026-10-15.
--
-- Closes a live hole: a quest's creator could mark their own reward claims
-- fulfilled.
--
-- qrc_business is FOR ALL USING (quests.creator_id = auth.uid()) with no
-- WITH CHECK, so the business that owes a cash prize could insert, update
-- and delete rows in quest_reward_claims, including setting status to
-- 'fulfilled'. That is the party who owes the money marking it paid, with no
-- payout row and nobody independent confirming it.
--
-- These are RESTRICTIVE policies, which AND with the permissive ones rather
-- than replacing them. qrc_business keeps granting SELECT, because a
-- business should see claims on its own quest, while every write path now
-- additionally requires a platform admin. Done this way rather than by
-- dropping and recreating qrc_business so no read access is interrupted
-- mid-flight.
--
-- Legitimate writes go through the reward functions, which record a payout
-- row and an audit event.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='quest_reward_claims' and policyname='qrc_no_self_insert') then
    create policy "qrc_no_self_insert" on public.quest_reward_claims
      as restrictive for insert
      with check (public.is_platform_admin(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='quest_reward_claims' and policyname='qrc_no_self_update') then
    create policy "qrc_no_self_update" on public.quest_reward_claims
      as restrictive for update
      using (public.is_platform_admin(auth.uid()))
      with check (public.is_platform_admin(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='quest_reward_claims' and policyname='qrc_no_self_delete') then
    create policy "qrc_no_self_delete" on public.quest_reward_claims
      as restrictive for delete
      using (public.is_platform_admin(auth.uid()));
  end if;
end $$;
