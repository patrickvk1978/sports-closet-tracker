-- Structural fix for auto-pick scoring:
--
-- 1. resolve_finalized_pick: stop excluding the current pick's actual prospect
--    from consideration. Previously, if a member's prediction matched the actual
--    pick, it was rejected as "already drafted" the moment actual_picks was
--    written, producing a false miss. The fix: only exclude prospects drafted
--    at OTHER pick numbers.
--
-- 2. Trigger on draft.actual_picks: call finalize_pick automatically whenever
--    a pick is recorded. Removes dependency on client 20s timer and sync script
--    being alive. Idempotent — honors manual live_cards via ON CONFLICT.

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
  watchlist_pick text := null;
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
      return query
      select predicted_pick, 'slot_prediction'::text, p_team_code;
      return;
    end if;

    select p.id
      into predicted_pick
    from public.prospects p
    where p.consensus_mock_pick = p_pick_number
      and not exists (
        select 1 from draft.actual_picks ap
        where ap.prospect_id = p.id
          and ap.pick_number <> p_pick_number
      )
    order by p.consensus_rank nulls last, p.name
    limit 1;

    if predicted_pick is not null then
      return query
      select predicted_pick, 'consensus_mock'::text, p_team_code;
      return;
    end if;

    select p.id
      into predicted_pick
    from public.prospects p
    where p.athletic_mock_pick = p_pick_number
      and not exists (
        select 1 from draft.actual_picks ap
        where ap.prospect_id = p.id
          and ap.pick_number <> p_pick_number
      )
    order by p.athletic_rank nulls last, p.name
    limit 1;

    if predicted_pick is not null then
      return query
      select predicted_pick, 'athletic_mock'::text, p_team_code;
      return;
    end if;

    select p.id
      into predicted_pick
    from public.prospects p
    where p.espn_mock_pick = p_pick_number
      and not exists (
        select 1 from draft.actual_picks ap
        where ap.prospect_id = p.id
          and ap.pick_number <> p_pick_number
      )
    order by p.espn_rank nulls last, p.name
    limit 1;

    if predicted_pick is not null then
      return query
      select predicted_pick, 'espn_mock'::text, p_team_code;
      return;
    end if;

    select p.id
      into predicted_pick
    from public.prospects p
    where p.ringer_mock_pick = p_pick_number
      and not exists (
        select 1 from draft.actual_picks ap
        where ap.prospect_id = p.id
          and ap.pick_number <> p_pick_number
      )
    order by p.ringer_rank nulls last, p.name
    limit 1;

    if predicted_pick is not null then
      return query
      select predicted_pick, 'ringer_mock'::text, p_team_code;
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

  select uw.prospect_id
    into watchlist_pick
  from draft.user_watchlists uw
  join public.prospects p
    on p.id = uw.prospect_id
  where uw.pool_id = p_pool_id
    and uw.user_id = p_user_id
    and uw.team_code = p_team_code
    and not exists (
      select 1 from draft.actual_picks ap
      where ap.prospect_id = uw.prospect_id
        and ap.pick_number <> p_pick_number
    )
    and (
      team_needs is null
      or exists (
        select 1
        from jsonb_array_elements_text(team_needs) as need(value)
        where need.value = any(string_to_array(p.position, '/'))
      )
    )
  order by p.consensus_rank nulls last, p.name
  limit 1;

  if watchlist_pick is not null then
    return query
    select watchlist_pick, 'team_watchlist'::text, p_team_code;
    return;
  end if;

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
    return query
    select fallback_team_need, 'board_team_need'::text, p_team_code;
    return;
  end if;

  if fallback_best_available is not null then
    return query
    select fallback_best_available, 'board_best_available'::text, p_team_code;
    return;
  end if;
end;
$$;

-- Trigger: auto-call finalize_pick whenever actual_picks is written.
-- Removes dependency on client timer and sync script uptime.
create or replace function draft.auto_finalize_on_actual_pick()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.finalize_pick(NEW.pick_number);
  return NEW;
end;
$$;

drop trigger if exists auto_finalize_on_actual_pick on draft.actual_picks;
create trigger auto_finalize_on_actual_pick
  after insert or update on draft.actual_picks
  for each row
  execute function draft.auto_finalize_on_actual_pick();
