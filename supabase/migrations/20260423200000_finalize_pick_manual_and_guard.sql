-- Pre-launch hardening for finalize_pick:
--   1. Honor a user's manual live_cards submission even when the pick is
--      trade-affected (previously gated behind v_allow_slot_sources which
--      discarded explicit user choices on traded picks).
--   2. Only flip draft.feed to 'awaiting_reveal' if the feed is still in an
--      earlier state, so a late-arriving client finalize cannot rubber-band a
--      pick that has already been revealed.

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

    -- Honor manual live card regardless of trade context. A manual submit is
    -- an explicit user choice for THIS pick and must never be discarded.
    if manual_pick is not null then
      insert into draft.finalized_picks (
        pool_id,
        user_id,
        pick_number,
        prospect_id,
        resolution_source,
        resolved_team_code,
        resolved_at
      )
      values (
        member_row.pool_id,
        member_row.user_id,
        p_pick_number,
        manual_pick,
        'manual_live',
        v_team_code,
        now()
      )
      on conflict (pool_id, user_id, pick_number) do update
      set
        prospect_id = excluded.prospect_id,
        resolution_source = excluded.resolution_source,
        resolved_team_code = excluded.resolved_team_code,
        resolved_at = excluded.resolved_at;
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
          pool_id,
          user_id,
          pick_number,
          prospect_id,
          resolution_source,
          resolved_team_code,
          resolved_at
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
        on conflict (pool_id, user_id, pick_number) do update
        set
          prospect_id = excluded.prospect_id,
          resolution_source = excluded.resolution_source,
          resolved_team_code = excluded.resolved_team_code,
          resolved_at = excluded.resolved_at;
      end if;
    end if;
  end loop;

  -- Only advance to awaiting_reveal if we haven't already moved past it.
  -- Prevents a late finalize from rubber-banding a revealed pick backwards.
  update draft.feed
  set
    current_status = 'awaiting_reveal',
    updated_at = now()
  where id = 1
    and current_pick_number = p_pick_number
    and current_status in ('on_clock', 'pick_is_in');
end;
$$;

-- Explicit grant in case default EXECUTE on public was revoked.
grant execute on function public.finalize_pick(integer) to authenticated;
