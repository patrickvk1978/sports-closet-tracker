-- On the Clock Round 2 rehearsal setup.
--
-- Keeps Round 1 actual picks intact so drafted players remain unavailable,
-- replaces the active pick order with picks 33-64, clears only Round 2 live
-- artifacts, and puts the shared feed on pick 33.

with data(pick_number, original_team, current_team) as (
  values
    (33, 'NYJ', 'SF'),
    (34, 'ARI', 'ARI'),
    (35, 'BUF', 'BUF'),
    (36, 'LV',  'LV'),
    (37, 'NYG', 'NYG'),
    (38, 'WAS', 'HOU'),
    (39, 'CLE', 'CLE'),
    (40, 'KC',  'KC'),
    (41, 'CIN', 'CIN'),
    (42, 'NO',  'NO'),
    (43, 'MIA', 'MIA'),
    (44, 'DAL', 'NYJ'),
    (45, 'BAL', 'BAL'),
    (46, 'TB',  'TB'),
    (47, 'IND', 'IND'),
    (48, 'ATL', 'ATL'),
    (49, 'MIN', 'MIN'),
    (50, 'DET', 'DET'),
    (51, 'CAR', 'CAR'),
    (52, 'GB',  'GB'),
    (53, 'PIT', 'PIT'),
    (54, 'PHI', 'PHI'),
    (55, 'LAC', 'LAC'),
    (56, 'JAX', 'JAX'),
    (57, 'CHI', 'CHI'),
    (58, 'SF',  'SF'),
    (59, 'HOU', 'HOU'),
    (60, 'BUF', 'CHI'),
    (61, 'LAR', 'LAR'),
    (62, 'DEN', 'DEN'),
    (63, 'NE',  'NE'),
    (64, 'SEA', 'SEA')
)
update public.round_1_picks
set
  original_team = data.original_team,
  current_team = data.current_team
from data
where public.round_1_picks.pick_number = data.pick_number;

insert into public.round_1_picks (pick_number, original_team, current_team)
select data.pick_number, data.original_team, data.current_team
from (
  values
    (33, 'NYJ', 'SF'),
    (34, 'ARI', 'ARI'),
    (35, 'BUF', 'BUF'),
    (36, 'LV',  'LV'),
    (37, 'NYG', 'NYG'),
    (38, 'WAS', 'HOU'),
    (39, 'CLE', 'CLE'),
    (40, 'KC',  'KC'),
    (41, 'CIN', 'CIN'),
    (42, 'NO',  'NO'),
    (43, 'MIA', 'MIA'),
    (44, 'DAL', 'NYJ'),
    (45, 'BAL', 'BAL'),
    (46, 'TB',  'TB'),
    (47, 'IND', 'IND'),
    (48, 'ATL', 'ATL'),
    (49, 'MIN', 'MIN'),
    (50, 'DET', 'DET'),
    (51, 'CAR', 'CAR'),
    (52, 'GB',  'GB'),
    (53, 'PIT', 'PIT'),
    (54, 'PHI', 'PHI'),
    (55, 'LAC', 'LAC'),
    (56, 'JAX', 'JAX'),
    (57, 'CHI', 'CHI'),
    (58, 'SF',  'SF'),
    (59, 'HOU', 'HOU'),
    (60, 'BUF', 'CHI'),
    (61, 'LAR', 'LAR'),
    (62, 'DEN', 'DEN'),
    (63, 'NE',  'NE'),
    (64, 'SEA', 'SEA')
) as data(pick_number, original_team, current_team)
where not exists (
  select 1
  from public.round_1_picks existing
  where existing.pick_number = data.pick_number
);

delete from draft.actual_picks
where pick_number between 33 and 64;

delete from draft.team_overrides
where pick_number between 33 and 64;

delete from draft.live_cards
where pick_number between 33 and 64;

delete from draft.queues
where pick_number between 33 and 64;

delete from draft.finalized_picks
where pick_number between 33 and 64;

update draft.feed
set
  phase = 'live',
  current_pick_number = 33,
  current_status = 'on_clock',
  pick_is_in_at = null,
  provider_expires_at = null,
  updated_at = now()
where id = 1;
