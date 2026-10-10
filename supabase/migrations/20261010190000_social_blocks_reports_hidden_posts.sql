-- Applied to cxujipeulvhreiryaptr on 2026-10-10.
--
-- Three things the social surfaces needed and the schema did not have:
-- blocking, reporting an account (as opposed to a single post, which
-- proof_reports already covered), and hiding one post from chosen people.
-- Plus the delete policy that made "delete my post" expressible at all.

-- ── Blocks ───────────────────────────────────────────────────────────────
-- One-directional in storage, two-directional in effect: one row says
-- "A blocked B", and every read that cares checks both orders.
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  -- Blocking yourself would silently hide your own posts from you.
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocked on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='user_blocks' and policyname='Own blocks are readable') then
    -- Only the blocker sees the row. The blocked person is never told, which
    -- is the point of a block.
    create policy "Own blocks are readable" on public.user_blocks
      for select using (blocker_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='user_blocks' and policyname='Block as yourself') then
    create policy "Block as yourself" on public.user_blocks
      for insert with check (blocker_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='user_blocks' and policyname='Unblock as yourself') then
    create policy "Unblock as yourself" on public.user_blocks
      for delete using (blocker_id = auth.uid());
  end if;
end $$;

-- ── Reports on people ────────────────────────────────────────────────────
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id <> reported_id),
  constraint user_reports_status_valid
    check (status in ('open', 'reviewing', 'actioned', 'dismissed'))
);

create index if not exists idx_user_reports_reported on public.user_reports (reported_id, status);
alter table public.user_reports enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='user_reports' and policyname='Report as yourself') then
    create policy "Report as yourself" on public.user_reports
      for insert with check (reporter_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='user_reports' and policyname='Reporters and admins read reports') then
    -- A reporter can confirm their own report landed; nobody else sees it,
    -- so being reported is not discoverable by the reported account.
    create policy "Reporters and admins read reports" on public.user_reports
      for select using (reporter_id = auth.uid() or public.is_platform_admin(auth.uid()));
  end if;
end $$;

-- ── Per-post hide list ───────────────────────────────────────────────────
-- Stored as the exclusion rather than an allow list, so the default stays
-- "everyone who could already see it".
create table if not exists public.proof_hidden_from (
  proof_id uuid not null references public.proof_submissions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (proof_id, user_id)
);

create index if not exists idx_proof_hidden_from_user on public.proof_hidden_from (user_id);
alter table public.proof_hidden_from enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='proof_hidden_from' and policyname='Post owner manages the hide list') then
    -- Only the author reads or writes it. A viewer must not be able to query
    -- who a post was hidden from, including themselves.
    create policy "Post owner manages the hide list" on public.proof_hidden_from
      for all
      using (exists (select 1 from public.proof_submissions ps
                      where ps.id = proof_id and ps.user_id = auth.uid()))
      with check (exists (select 1 from public.proof_submissions ps
                           where ps.id = proof_id and ps.user_id = auth.uid()));
  end if;
end $$;

-- ── Authors can delete their own posts ───────────────────────────────────
-- proof_submissions had insert and update policies but none for delete, so
-- "delete my post" was not expressible. Moderators keep using admin_removed
-- rather than a hard delete, which is what preserves the audit trail.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='proof_submissions' and policyname='Authors can delete their own proof') then
    create policy "Authors can delete their own proof" on public.proof_submissions
      for delete using (user_id = auth.uid());
  end if;
end $$;

-- ── Visibility now respects blocks and the hide list ─────────────────────
-- can_see_proof is the single gate used by the feed, by proof_likes and by
-- comments, so extending it here applies everywhere at once rather than
-- leaving each call site to remember.
create or replace function public.can_see_proof(p_proof_id uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT EXISTS (
    SELECT 1 FROM public.proof_submissions ps
      JOIN public.challenges c ON c.id = ps.challenge_id
     WHERE ps.id = p_proof_id AND ps.admin_removed = false
       AND (ps.user_id = p_viewer
            OR (ps.verification_status = 'approved'
                AND (c.visibility = 'public' OR c.creator_id = p_viewer
                     OR public.is_challenge_participant(c.id, p_viewer))
                AND NOT EXISTS (
                  SELECT 1 FROM public.proof_hidden_from h
                   WHERE h.proof_id = ps.id AND h.user_id = p_viewer
                )
                AND NOT EXISTS (
                  SELECT 1 FROM public.user_blocks b
                   WHERE (b.blocker_id = ps.user_id AND b.blocked_id = p_viewer)
                      OR (b.blocker_id = p_viewer AND b.blocked_id = ps.user_id)
                )))
  );
$function$;
