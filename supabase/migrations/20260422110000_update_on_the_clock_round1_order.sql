-- Update On the Clock round-one order to the latest published NFL draft order.
-- This keeps pick numbers stable while setting the canonical original/current
-- team holder for each slot in public.round_1_picks.

update public.round_1_picks
set
  original_team = data.original_team,
  current_team = data.current_team
from (
  values
    (1,  'LV',  'LV'),
    (2,  'NYJ', 'NYJ'),
    (3,  'ARI', 'ARI'),
    (4,  'TEN', 'TEN'),
    (5,  'NYG', 'NYG'),
    (6,  'CLE', 'CLE'),
    (7,  'WAS', 'WAS'),
    (8,  'NO',  'NO'),
    (9,  'KC',  'KC'),
    (10, 'CIN', 'NYG'),
    (11, 'MIA', 'MIA'),
    (12, 'DAL', 'DAL'),
    (13, 'ATL', 'LAR'),
    (14, 'BAL', 'BAL'),
    (15, 'TB',  'TB'),
    (16, 'IND', 'NYJ'),
    (17, 'DET', 'DET'),
    (18, 'MIN', 'MIN'),
    (19, 'CAR', 'CAR'),
    (20, 'GB',  'DAL'),
    (21, 'PIT', 'PIT'),
    (22, 'LAC', 'LAC'),
    (23, 'PHI', 'PHI'),
    (24, 'JAX', 'CLE'),
    (25, 'CHI', 'CHI'),
    (26, 'BUF', 'BUF'),
    (27, 'SF',  'SF'),
    (28, 'HOU', 'HOU'),
    (29, 'LAR', 'KC'),
    (30, 'DEN', 'MIA'),
    (31, 'NE',  'NE'),
    (32, 'SEA', 'SEA')
) as data(pick_number, original_team, current_team)
where public.round_1_picks.pick_number = data.pick_number;

-- If team overrides were being used to simulate this order before the
-- canonical round_1_picks table was updated, clear them so the app doesn't
-- keep showing stale override values on top of the new base order.
delete from draft.team_overrides
where pick_number between 1 and 32;
