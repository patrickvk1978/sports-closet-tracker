-- Round 2 On the Clock hardening:
-- - remove watchlists from auto-pick fallback
-- - freeze finalized picks once resolved
-- - add lightweight pool-scoped chat

create table if not exists draft.pool_chat_messages (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table draft.pool_chat_messages enable row level security;
alter table draft.pool_chat_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table draft.pool_chat_messages;
exception
  when duplicate_object then null;
end $$;

drop policy if exists "Members read pool chat messages" on draft.pool_chat_messages;
create policy "Members read pool chat messages"
  on draft.pool_chat_messages for select
  using (public.is_pool_member(pool_id));

drop policy if exists "Members insert pool chat messages" on draft.pool_chat_messages;
create policy "Members insert pool chat messages"
  on draft.pool_chat_messages for insert
  with check (
    user_id = auth.uid()
    and public.is_pool_member(pool_id)
  );

create or replace function draft.resolve_finalized_pick(
  p_pool_id uuid,
  p_user_id uuid,
  p_pick_number integer,
  p_team_code text,
  p_allow_slot_sources boolean
)
returns table (
  prospect_id text,
  resolution_source text,
  resolved_team_code text
)
language plpgsql
security definer
as $$
declare
  predicted_pick text;
  board_value jsonb;
  team_needs jsonb;
  fallback_best_available text := null;
  fallback_team_need text := null;
  board_item record;
  prospect_row record;
begin
  if p_allow_slot_sources then
    select q.prospect_id
      into predicted_pick
    from draft.queues q
    where q.pool_id = p_pool_id
      and q.user_id = p_user_id
      and q.pick_number = p_pick_number
    limit 1;

    if predicted_pick is not null and not exists (
      select 1
      from draft.actual_picks ap
      where ap.prospect_id = predicted_pick
        and ap.pick_number <> p_pick_number
    ) then
      return query select predicted_pick, 'slot_prediction'::text, p_team_code;
      return;
    end if;

    select p.id into predicted_pick
    from public.prospects p
    where p.consensus_mock_pick = p_pick_number
      and not exists (select 1 from draft.actual_picks ap where ap.prospect_id = p.id and ap.pick_number <> p_pick_number)
    order by p.consensus_rank nulls last, p.name
    limit 1;
    if predicted_pick is not null then
      return query select predicted_pick, 'consensus_mock'::text, p_team_code;
      return;
    end if;

    select p.id into predicted_pick
    from public.prospects p
    where p.athletic_mock_pick = p_pick_number
      and not exists (select 1 from draft.actual_picks ap where ap.prospect_id = p.id and ap.pick_number <> p_pick_number)
    order by p.athletic_rank nulls last, p.name
    limit 1;
    if predicted_pick is not null then
      return query select predicted_pick, 'athletic_mock'::text, p_team_code;
      return;
    end if;

    select p.id into predicted_pick
    from public.prospects p
    where p.espn_mock_pick = p_pick_number
      and not exists (select 1 from draft.actual_picks ap where ap.prospect_id = p.id and ap.pick_number <> p_pick_number)
    order by p.espn_rank nulls last, p.name
    limit 1;
    if predicted_pick is not null then
      return query select predicted_pick, 'espn_mock'::text, p_team_code;
      return;
    end if;

    select p.id into predicted_pick
    from public.prospects p
    where p.ringer_mock_pick = p_pick_number
      and not exists (select 1 from draft.actual_picks ap where ap.prospect_id = p.id and ap.pick_number <> p_pick_number)
    order by p.ringer_rank nulls last, p.name
    limit 1;
    if predicted_pick is not null then
      return query select predicted_pick, 'ringer_mock'::text, p_team_code;
      return;
    end if;
  end if;

  select to_jsonb(bb.board_order)
    into board_value
  from draft.big_boards bb
  where bb.pool_id = p_pool_id
    and bb.user_id = p_user_id
  limit 1;

  if board_value is null then
    select jsonb_agg(p.id order by p.consensus_rank nulls last, p.name)
      into board_value
    from public.prospects p;
  end if;

  select to_jsonb(t.needs)
    into team_needs
  from public.nfl_teams t
  where t.code = p_team_code
  limit 1;

  for board_item in
    select value as prospect_id
    from jsonb_array_elements_text(coalesce(board_value, '[]'::jsonb))
  loop
    select p.id, p.position
      into prospect_row
    from public.prospects p
    where p.id = board_item.prospect_id
      and not exists (
        select 1 from draft.actual_picks ap
        where ap.prospect_id = p.id
          and ap.pick_number <> p_pick_number
      )
    limit 1;

    if prospect_row.id is null then
      continue;
    end if;

    if fallback_best_available is null then
      fallback_best_available := prospect_row.id;
    end if;

    if team_needs is not null and exists (
      select 1
      from jsonb_array_elements_text(team_needs) as need(value)
      where need.value = any(string_to_array(prospect_row.position, '/'))
    ) then
      fallback_team_need := prospect_row.id;
      exit;
    end if;
  end loop;

  if fallback_team_need is not null then
    return query select fallback_team_need, 'board_team_need'::text, p_team_code;
    return;
  end if;

  if fallback_best_available is not null then
    return query select fallback_best_available, 'board_best_available'::text, p_team_code;
    return;
  end if;
end;
$$;

create or replace function public.finalize_pick(p_pick_number integer)
returns void
language plpgsql
security definer
as $$
declare
  v_team_code text;
  v_original_team text;
  v_allow_slot_sources boolean;
  member_row record;
  resolved_row record;
  manual_pick text;
begin
  select coalesce(t.team_code, r.current_team), r.original_team
    into v_team_code, v_original_team
  from public.round_1_picks r
  left join draft.team_overrides t
    on t.pick_number = r.pick_number
  where r.pick_number = p_pick_number
  limit 1;

  v_allow_slot_sources := v_team_code = v_original_team;

  for member_row in
    select pm.pool_id, pm.user_id
    from public.pool_members pm
    join public.pools p
      on p.id = pm.pool_id
    where p.game_type = 'nfl_draft'
  loop
    select lc.prospect_id
      into manual_pick
    from draft.live_cards lc
    where lc.pool_id = member_row.pool_id
      and lc.user_id = member_row.user_id
      and lc.pick_number = p_pick_number
    limit 1;

    if manual_pick is not null then
      insert into draft.finalized_picks (
        pool_id, user_id, pick_number, prospect_id, resolution_source, resolved_team_code, resolved_at
      )
      values (
        member_row.pool_id, member_row.user_id, p_pick_number, manual_pick, 'manual_live', v_team_code, now()
      )
      on conflict (pool_id, user_id, pick_number) do nothing;
    else
      select *
        into resolved_row
      from draft.resolve_finalized_pick(
        member_row.pool_id,
        member_row.user_id,
        p_pick_number,
        v_team_code,
        v_allow_slot_sources
      )
      limit 1;

      if resolved_row.prospect_id is not null then
        insert into draft.finalized_picks (
          pool_id, user_id, pick_number, prospect_id, resolution_source, resolved_team_code, resolved_at
        )
        values (
          member_row.pool_id,
          member_row.user_id,
          p_pick_number,
          resolved_row.prospect_id,
          resolved_row.resolution_source,
          resolved_row.resolved_team_code,
          now()
        )
        on conflict (pool_id, user_id, pick_number) do nothing;
      end if;
    end if;
  end loop;

  update draft.feed
  set current_status = 'awaiting_reveal', updated_at = now()
  where id = 1
    and current_pick_number = p_pick_number
    and current_status in ('on_clock', 'pick_is_in');
end;
$$;

grant execute on function public.finalize_pick(integer) to authenticated;
