import { createContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  DEFAULT_ACTUAL_PICKS,
  DEFAULT_BIG_BOARD_IDS,
  DEFAULT_LIVE_PREDICTIONS,
  DEFAULT_MOCK_PREDICTIONS,
  PROSPECTS,
  ROUND_ONE_PICKS,
  TEAMS,
  getProspectById,
} from "../lib/draftData";

export const PoolContext = createContext(null);

const POOLS_KEY = "otc_mock_pools";
const MEMBERS_KEY = "otc_mock_memberships";
const ACTIVE_KEY = "otc_active_pool_id";
const BIG_BOARDS_KEY = "otc_big_boards";
const LIVE_PREDICTIONS_KEY = "otc_live_predictions";
const LIVE_SELECTIONS_KEY = "otc_live_current_selections";
const LIVE_CARDS_KEY = "otc_live_submitted_cards";
const MOCK_PREDICTIONS_KEY = "otc_mock_predictions";
const MOCK_SUBMISSIONS_KEY = "otc_mock_submissions";
const DRAFT_FEED_KEY = "otc_draft_feed";

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function userScopedKey(poolId, userId) {
  return `${poolId}:${userId}`;
}

function makeDefaultDraftFeed() {
  return {
    phase: "pre_draft",
    current_pick_number: 1,
    current_status: "on_clock",
    actual_picks: {},
    team_overrides: {},
  };
}

function buildFallback({ boardIds, teamCode, fallbackMethod, draftedIds }) {
  const available = boardIds
    .filter((prospectId) => !draftedIds.has(prospectId))
    .map(getProspectById)
    .filter(Boolean);

  if (available.length === 0) return null;
  if (fallbackMethod !== "queue_plus_team_need") return available[0];

  const teamNeeds = new Set(TEAMS[teamCode]?.needs ?? []);
  return (
    available.find((prospect) =>
      prospect.position.split("/").some((position) => teamNeeds.has(position))
    ) ?? available[0]
  );
}

const LIVE_SETTINGS_DEFAULTS = {
  exact_player_points: 5,
  correct_position_points: 2,
  fallback_method: "queue_plus_team_need",
  reveal_behavior: "after_pick",
};

const MOCK_SETTINGS_DEFAULTS = {
  exact_hit_points: 3,
  one_away_points: 2,
  two_away_points: 1,
};

const DEMO_MEMBER_VARIANTS = [
  {
    username: "Sarah",
    live: {
      1: "cam-ward",
      2: "travis-hunter",
      3: "abdul-carter",
      4: "will-campbell",
      5: "mason-graham",
      6: "ashton-jeanty",
      7: "will-johnson",
      8: "kelvin-banks",
    },
    mock: {
      1: "cam-ward",
      2: "travis-hunter",
      3: "abdul-carter",
      4: "will-campbell",
      5: "mason-graham",
      6: "ashton-jeanty",
      7: "will-johnson",
      8: "kelvin-banks",
    },
  },
  {
    username: "Davin",
    live: {
      1: "cam-ward",
      2: "travis-hunter",
      3: "will-campbell",
      4: "kelvin-banks",
      5: "will-johnson",
      6: "jalen-milroe",
      7: "mason-graham",
      8: "ashton-jeanty",
    },
    mock: {
      1: "cam-ward",
      2: "travis-hunter",
      3: "will-campbell",
      4: "kelvin-banks",
      5: "will-johnson",
      6: "jalen-milroe",
      7: "mason-graham",
      8: "ashton-jeanty",
    },
  },
  {
    username: "Maya",
    live: {
      1: "cam-ward",
      2: "abdul-carter",
      3: "travis-hunter",
      4: "tet-mcmillan",
      5: "mason-graham",
      6: "ashton-jeanty",
      7: "kelvin-banks",
      8: "will-johnson",
    },
    mock: {
      1: "cam-ward",
      2: "abdul-carter",
      3: "travis-hunter",
      4: "tet-mcmillan",
      5: "mason-graham",
      6: "ashton-jeanty",
      7: "kelvin-banks",
      8: "will-johnson",
    },
  },
];

export function PoolProvider({ children }) {
  const { session } = useAuth();
  const [poolsStore, setPoolsStore] = useState(() => readJson(POOLS_KEY, []));
  const [membersStore, setMembersStore] = useState(() => readJson(MEMBERS_KEY, []));
  const [bigBoardsStore, setBigBoardsStore] = useState(() => readJson(BIG_BOARDS_KEY, {}));
  const [livePredictionsStore, setLivePredictionsStore] = useState(() => readJson(LIVE_PREDICTIONS_KEY, {}));
  const [liveSelectionsStore, setLiveSelectionsStore] = useState(() => readJson(LIVE_SELECTIONS_KEY, {}));
  const [liveCardsStore, setLiveCardsStore] = useState(() => readJson(LIVE_CARDS_KEY, {}));
  const [mockPredictionsStore, setMockPredictionsStore] = useState(() => readJson(MOCK_PREDICTIONS_KEY, {}));
  const [mockSubmittedStore, setMockSubmittedStore] = useState(() => readJson(MOCK_SUBMISSIONS_KEY, {}));
  const [draftFeed, setDraftFeed] = useState(() => readJson(DRAFT_FEED_KEY, makeDefaultDraftFeed()));
  const [pool, setPool] = useState(null);
  const [allPools, setAllPools] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => localStorage.setItem(POOLS_KEY, JSON.stringify(poolsStore)), [poolsStore]);
  useEffect(() => localStorage.setItem(MEMBERS_KEY, JSON.stringify(membersStore)), [membersStore]);
  useEffect(() => localStorage.setItem(BIG_BOARDS_KEY, JSON.stringify(bigBoardsStore)), [bigBoardsStore]);
  useEffect(() => localStorage.setItem(LIVE_PREDICTIONS_KEY, JSON.stringify(livePredictionsStore)), [livePredictionsStore]);
  useEffect(() => localStorage.setItem(LIVE_SELECTIONS_KEY, JSON.stringify(liveSelectionsStore)), [liveSelectionsStore]);
  useEffect(() => localStorage.setItem(LIVE_CARDS_KEY, JSON.stringify(liveCardsStore)), [liveCardsStore]);
  useEffect(() => localStorage.setItem(MOCK_PREDICTIONS_KEY, JSON.stringify(mockPredictionsStore)), [mockPredictionsStore]);
  useEffect(() => localStorage.setItem(MOCK_SUBMISSIONS_KEY, JSON.stringify(mockSubmittedStore)), [mockSubmittedStore]);
  useEffect(() => localStorage.setItem(DRAFT_FEED_KEY, JSON.stringify(draftFeed)), [draftFeed]);

  useEffect(() => {
    if (!session?.user) {
      setPool(null);
      setAllPools([]);
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const mine = membersStore
      .filter((membership) => membership.user_id === session.user.id)
      .map((membership) => membership.pool_id);
    const ownedPools = poolsStore.filter((item) => mine.includes(item.id));
    setAllPools(ownedPools);

    const activeId = localStorage.getItem(ACTIVE_KEY) ?? ownedPools[0]?.id ?? null;
    const activePool = ownedPools.find((item) => item.id === activeId) ?? ownedPools[0] ?? null;
    setPool(activePool);

    if (activePool) {
      localStorage.setItem(ACTIVE_KEY, activePool.id);
      setMembers(
        membersStore
          .filter((membership) => membership.pool_id === activePool.id)
          .map((membership) => ({
            user_id: membership.user_id,
            profiles: {
              username: membership.username,
              is_admin: membership.user_id === activePool.admin_id,
            },
          }))
      );
    } else {
      setMembers([]);
    }

    setIsLoading(false);
  }, [membersStore, poolsStore, session?.user]);

  const scopedKey = pool && session?.user ? userScopedKey(pool.id, session.user.id) : null;
  const bigBoardIds = scopedKey ? bigBoardsStore[scopedKey] ?? DEFAULT_BIG_BOARD_IDS : DEFAULT_BIG_BOARD_IDS;
  const livePredictions = scopedKey ? livePredictionsStore[scopedKey] ?? DEFAULT_LIVE_PREDICTIONS : DEFAULT_LIVE_PREDICTIONS;
  const liveSelections = scopedKey ? liveSelectionsStore[scopedKey] ?? {} : {};
  const liveCards = scopedKey ? liveCardsStore[scopedKey] ?? {} : {};
  const mockPredictions = scopedKey ? mockPredictionsStore[scopedKey] ?? DEFAULT_MOCK_PREDICTIONS : DEFAULT_MOCK_PREDICTIONS;
  const hasSubmittedMock = scopedKey ? Boolean(mockSubmittedStore[scopedKey]) : false;
  const memberList = members.map((member) => ({
    id: member.user_id,
    name: member.profiles.username,
    isAdmin: member.profiles.is_admin,
    isCurrentUser: member.user_id === session?.user?.id,
  }));

  function settingsForPool(targetPool = pool) {
    if (!targetPool) return LIVE_SETTINGS_DEFAULTS;
    return targetPool.game_mode === "mock_challenge"
      ? { ...MOCK_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) }
      : { ...LIVE_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) };
  }

  function teamCodeForPick(pickNumber) {
    const pick = ROUND_ONE_PICKS.find((item) => item.number === pickNumber);
    if (!pick) return null;
    return draftFeed.team_overrides?.[pickNumber] ?? pick.currentTeam;
  }

  function getMemberBigBoard(poolId, userId) {
    return bigBoardsStore[userScopedKey(poolId, userId)] ?? DEFAULT_BIG_BOARD_IDS;
  }

  function getMemberLivePredictions(poolId, userId) {
    return livePredictionsStore[userScopedKey(poolId, userId)] ?? DEFAULT_LIVE_PREDICTIONS;
  }

  function getMemberMockPredictions(poolId, userId) {
    return mockPredictionsStore[userScopedKey(poolId, userId)] ?? DEFAULT_MOCK_PREDICTIONS;
  }

  function getMemberLiveCards(poolId, userId) {
    return liveCardsStore[userScopedKey(poolId, userId)] ?? {};
  }

  function resolveLivePickForUser(poolId, userId, pickNumber) {
    const targetPool = poolsStore.find((item) => item.id === poolId);
    const settings = settingsForPool(targetPool);
    const cards = getMemberLiveCards(poolId, userId);
    if (cards[pickNumber]) return cards[pickNumber];

    const predictions = getMemberLivePredictions(poolId, userId);
    if (predictions[pickNumber]) return predictions[pickNumber];

    const boardIds = getMemberBigBoard(poolId, userId);
    const draftedIds = new Set(Object.values(draftFeed.actual_picks ?? {}));
    const fallback = buildFallback({
      boardIds,
      teamCode: teamCodeForPick(pickNumber),
      fallbackMethod: settings.fallback_method,
      draftedIds,
    });
    return fallback?.id ?? null;
  }

  function liveResultForPick(prospectId, actualProspectId) {
    if (!actualProspectId || !prospectId) return "waiting";
    if (prospectId === actualProspectId) return "exact";
    const prospect = getProspectById(prospectId);
    const actualProspect = getProspectById(actualProspectId);
    const samePosition =
      prospect &&
      actualProspect &&
      prospect.position.split("/").some((position) => actualProspect.position.split("/").includes(position));
    return samePosition ? "position" : "miss";
  }

  async function createPool({ name, gameMode, settings }) {
    const newPool = {
      id: crypto.randomUUID(),
      name,
      admin_id: session.user.id,
      invite_code: generateInviteCode(),
      game_mode: gameMode,
      settings: settings ?? (gameMode === "mock_challenge" ? MOCK_SETTINGS_DEFAULTS : LIVE_SETTINGS_DEFAULTS),
      created_at: new Date().toISOString(),
    };

    setPoolsStore((current) => [...current, newPool]);
    setMembersStore((current) => [
      ...current,
      { pool_id: newPool.id, user_id: session.user.id, username: session.user.username },
    ]);
    localStorage.setItem(ACTIVE_KEY, newPool.id);
    return { pool: newPool };
  }

  async function seedDemoPools() {
    if (!session?.user) return {};

    const existingLive = poolsStore.find((item) => item.name === "Friday Night Room" && item.admin_id === session.user.id);
    const existingMock = poolsStore.find((item) => item.name === "National Mock Room" && item.admin_id === session.user.id);

    const demoPools = [];

    if (!existingLive) {
      demoPools.push({
        id: crypto.randomUUID(),
        name: "Friday Night Room",
        admin_id: session.user.id,
        invite_code: generateInviteCode(),
        game_mode: "live_draft",
        settings: { ...LIVE_SETTINGS_DEFAULTS },
        created_at: new Date().toISOString(),
      });
    }

    if (!existingMock) {
      demoPools.push({
        id: crypto.randomUUID(),
        name: "National Mock Room",
        admin_id: session.user.id,
        invite_code: generateInviteCode(),
        game_mode: "mock_challenge",
        settings: { ...MOCK_SETTINGS_DEFAULTS },
        created_at: new Date().toISOString(),
      });
    }

    if (demoPools.length === 0) {
      const livePool = existingLive ?? existingMock;
      if (livePool) localStorage.setItem(ACTIVE_KEY, livePool.id);
      return { pool: livePool };
    }

    const nextPools = [...poolsStore, ...demoPools];
    const nextMembers = [...membersStore];
    const nextBigBoards = { ...bigBoardsStore };
    const nextLivePredictions = { ...livePredictionsStore };
    const nextLiveCards = { ...liveCardsStore };
    const nextMockPredictions = { ...mockPredictionsStore };
    const nextMockSubmissions = { ...mockSubmittedStore };

    demoPools.forEach((demoPool) => {
      const memberEntries = [
        { user_id: session.user.id, username: session.user.username, live: DEFAULT_LIVE_PREDICTIONS, mock: DEFAULT_MOCK_PREDICTIONS },
        ...DEMO_MEMBER_VARIANTS.map((variant, index) => ({
          user_id: `${demoPool.id}-demo-${index + 1}`,
          username: variant.username,
          live: variant.live,
          mock: variant.mock,
        })),
      ];

      memberEntries.forEach((entry, index) => {
        nextMembers.push({ pool_id: demoPool.id, user_id: entry.user_id, username: entry.username });
        nextBigBoards[userScopedKey(demoPool.id, entry.user_id)] = DEFAULT_BIG_BOARD_IDS;
        nextLivePredictions[userScopedKey(demoPool.id, entry.user_id)] = entry.live;
        nextMockPredictions[userScopedKey(demoPool.id, entry.user_id)] = entry.mock;
        if (demoPool.game_mode === "live_draft" && index > 0) {
          nextLiveCards[userScopedKey(demoPool.id, entry.user_id)] = { 1: entry.live[1] };
        }
        if (demoPool.game_mode === "mock_challenge") {
          nextMockSubmissions[userScopedKey(demoPool.id, entry.user_id)] = true;
        }
      });
    });

    setPoolsStore(nextPools);
    setMembersStore(nextMembers);
    setBigBoardsStore(nextBigBoards);
    setLivePredictionsStore(nextLivePredictions);
    setLiveCardsStore(nextLiveCards);
    setMockPredictionsStore(nextMockPredictions);
    setMockSubmittedStore(nextMockSubmissions);

    const activePool = demoPools.find((item) => item.game_mode === "live_draft") ?? demoPools[0];
    localStorage.setItem(ACTIVE_KEY, activePool.id);
    return { pool: activePool };
  }

  async function joinPool(inviteCode) {
    const target = poolsStore.find((item) => item.invite_code === inviteCode.trim().toUpperCase());
    if (!target) return { error: "Invalid invite code" };

    const exists = membersStore.find(
      (membership) => membership.pool_id === target.id && membership.user_id === session.user.id
    );

    if (!exists) {
      setMembersStore((current) => [
        ...current,
        { pool_id: target.id, user_id: session.user.id, username: session.user.username },
      ]);
    }

    localStorage.setItem(ACTIVE_KEY, target.id);
    return { pool: target };
  }

  function switchPool(poolId) {
    localStorage.setItem(ACTIVE_KEY, poolId);
    const nextPool = allPools.find((item) => item.id === poolId) ?? null;
    setPool(nextPool);
  }

  async function updatePoolSettings(settingsPatch) {
    if (!pool) return;
    setPoolsStore((current) =>
      current.map((item) =>
        item.id === pool.id
          ? { ...item, settings: { ...(item.settings ?? {}), ...settingsPatch } }
          : item
      )
    );
  }

  async function updatePoolMeta(patch) {
    if (!pool) return;
    setPoolsStore((current) =>
      current.map((item) => (item.id === pool.id ? { ...item, ...patch } : item))
    );
  }

  function saveBigBoard(nextBoardIds) {
    if (!scopedKey) return;
    setBigBoardsStore((current) => ({ ...current, [scopedKey]: nextBoardIds }));
  }

  function moveBigBoardItem(prospectId, direction) {
    saveBigBoard(
      (() => {
        const index = bigBoardIds.indexOf(prospectId);
        const nextIndex = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || nextIndex < 0 || nextIndex >= bigBoardIds.length) return bigBoardIds;
        const next = [...bigBoardIds];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        return next;
      })()
    );
  }

  function saveLivePrediction(pickNumber, prospectId) {
    if (!scopedKey) return;
    setLivePredictionsStore((current) => ({
      ...current,
      [scopedKey]: { ...(current[scopedKey] ?? DEFAULT_LIVE_PREDICTIONS), [pickNumber]: prospectId },
    }));
  }

  function setLiveCurrentSelection(pickNumber, prospectId) {
    if (!scopedKey) return;
    setLiveSelectionsStore((current) => ({
      ...current,
      [scopedKey]: { ...(current[scopedKey] ?? {}), [pickNumber]: prospectId },
    }));
  }

  function submitLiveCard(pickNumber) {
    if (!scopedKey || !pool) return null;
    const pick = ROUND_ONE_PICKS.find((item) => item.number === pickNumber);
    if (!pick) return null;

    const draftedIds = new Set(Object.values(draftFeed.actual_picks ?? {}));
    const selectedProspectId =
      liveSelections[pickNumber] ??
      livePredictions[pickNumber] ??
      buildFallback({
        boardIds: bigBoardIds,
        teamCode: pick.currentTeam,
        fallbackMethod: pool.settings?.fallback_method,
        draftedIds,
      })?.id ??
      null;

    if (!selectedProspectId) return null;

    setLiveCardsStore((current) => ({
      ...current,
      [scopedKey]: { ...(current[scopedKey] ?? {}), [pickNumber]: selectedProspectId },
    }));
    setLiveSelectionsStore((current) => ({
      ...current,
      [scopedKey]: { ...(current[scopedKey] ?? {}), [pickNumber]: selectedProspectId },
    }));

    return selectedProspectId;
  }

  function saveMockPrediction(pickNumber, prospectId) {
    if (!scopedKey) return;
    setMockPredictionsStore((current) => ({
      ...current,
      [scopedKey]: { ...(current[scopedKey] ?? DEFAULT_MOCK_PREDICTIONS), [pickNumber]: prospectId },
    }));
  }

  function submitMockPredictions() {
    if (!scopedKey) return;
    setMockSubmittedStore((current) => ({ ...current, [scopedKey]: true }));
  }

  function resetMockPredictions() {
    if (!scopedKey) return;
    setMockSubmittedStore((current) => ({ ...current, [scopedKey]: false }));
  }

  function startDraftNight() {
    setDraftFeed((current) => ({ ...current, phase: "live", current_pick_number: 1, current_status: "on_clock" }));
  }

  function setDraftPhase(phase) {
    setDraftFeed((current) => ({ ...current, phase }));
  }

  function setCurrentPickNumber(pickNumber) {
    setDraftFeed((current) => ({
      ...current,
      current_pick_number: Math.max(1, Math.min(Number(pickNumber), ROUND_ONE_PICKS.length)),
      current_status: "on_clock",
    }));
  }

  function setPickStatus(status) {
    setDraftFeed((current) => ({ ...current, current_status: status }));
  }

  function overrideTeamOnClock(teamCode, pickNumber = draftFeed.current_pick_number) {
    setDraftFeed((current) => ({
      ...current,
      team_overrides: {
        ...(current.team_overrides ?? {}),
        [pickNumber]: teamCode,
      },
    }));
  }

  function clearTeamOverride(pickNumber = draftFeed.current_pick_number) {
    setDraftFeed((current) => {
      const nextOverrides = { ...(current.team_overrides ?? {}) };
      delete nextOverrides[pickNumber];
      return { ...current, team_overrides: nextOverrides };
    });
  }

  function revealCurrentPick(prospectId, pickNumber = draftFeed.current_pick_number) {
    const resolved = prospectId ?? DEFAULT_ACTUAL_PICKS[pickNumber] ?? PROSPECTS[pickNumber - 1]?.id ?? null;
    if (!resolved) return;

    setDraftFeed((current) => ({
      ...current,
      current_status: "revealed",
      actual_picks: { ...(current.actual_picks ?? {}), [pickNumber]: resolved },
    }));
  }

  function rollbackPick(pickNumber = draftFeed.current_pick_number) {
    setDraftFeed((current) => {
      const nextActualPicks = { ...(current.actual_picks ?? {}) };
      delete nextActualPicks[pickNumber];
      return {
        ...current,
        actual_picks: nextActualPicks,
        current_pick_number: pickNumber,
        current_status: "on_clock",
      };
    });
  }

  function advanceDraft() {
    setDraftFeed((current) => ({
      ...current,
      phase: "live",
      current_pick_number: Math.min(current.current_pick_number + 1, ROUND_ONE_PICKS.length),
      current_status: "on_clock",
    }));
  }

  function resetDraftFeed() {
    setDraftFeed(makeDefaultDraftFeed());
  }

  const mockStandings = useMemo(() => {
    const basePlayers = members.map((member) => ({
      id: member.user_id,
      name: member.profiles.username,
      points: 0,
    }));

    return basePlayers
      .map((player) => {
        const predictionKey = userScopedKey(pool?.id, player.id);
        const predictions = mockPredictionsStore[predictionKey] ?? DEFAULT_MOCK_PREDICTIONS;
        let points = 0;

        Object.entries(draftFeed.actual_picks ?? {}).forEach(([pickNumberString, prospectId]) => {
          const pickNumber = Number(pickNumberString);
          const predictedSlot = Object.entries(predictions).find(([, id]) => id === prospectId)?.[0];
          if (!predictedSlot) return;
          const distance = Math.abs(Number(predictedSlot) - pickNumber);
          if (distance === 0) points += pool?.settings?.exact_hit_points ?? MOCK_SETTINGS_DEFAULTS.exact_hit_points;
          if (distance === 1) points += pool?.settings?.one_away_points ?? MOCK_SETTINGS_DEFAULTS.one_away_points;
          if (distance === 2) points += pool?.settings?.two_away_points ?? MOCK_SETTINGS_DEFAULTS.two_away_points;
        });

        return { ...player, points };
      })
      .sort((a, b) => b.points - a.points);
  }, [draftFeed.actual_picks, members, mockPredictionsStore, pool?.id, pool?.settings]);

  const liveStandings = useMemo(() => {
    if (!pool) return [];
    const settings = settingsForPool(pool);

    return memberList
      .map((member) => {
        let exact = 0;
        let position = 0;
        let points = 0;

        Object.entries(draftFeed.actual_picks ?? {}).forEach(([pickNumberString, actualProspectId]) => {
          const pickNumber = Number(pickNumberString);
          const prospectId = resolveLivePickForUser(pool.id, member.id, pickNumber);
          const result = liveResultForPick(prospectId, actualProspectId);
          if (result === "exact") {
            exact += 1;
            points += settings.exact_player_points;
          }
          if (result === "position") {
            position += 1;
            points += settings.correct_position_points;
          }
        });

        return {
          id: member.id,
          name: member.name,
          exact,
          position,
          points,
        };
      })
      .sort((a, b) => b.points - a.points);
  }, [draftFeed.actual_picks, memberList, pool, poolsStore, liveCardsStore, livePredictionsStore, bigBoardsStore]);

  const currentLivePoolState = useMemo(() => {
    if (!pool) return [];
    const actualProspectId = draftFeed.actual_picks?.[draftFeed.current_pick_number] ?? null;

    return memberList.map((member) => {
      const lockedProspectId = getMemberLiveCards(pool.id, member.id)[draftFeed.current_pick_number] ?? null;
      const effectiveProspectId = resolveLivePickForUser(pool.id, member.id, draftFeed.current_pick_number);
      const result = liveResultForPick(effectiveProspectId, actualProspectId);
      return {
        id: member.id,
        name: member.name,
        isCurrentUser: member.isCurrentUser,
        locked: Boolean(lockedProspectId),
        prospect: getProspectById(effectiveProspectId),
        result,
      };
    });
  }, [draftFeed.actual_picks, draftFeed.current_pick_number, memberList, pool, liveCardsStore, livePredictionsStore, bigBoardsStore]);

  const mockTrackingRows = useMemo(() => {
    if (!pool) return [];
    const actualPicks = draftFeed.actual_picks ?? {};
    const opponentMembers = memberList.filter((member) => !member.isCurrentUser);

    return ROUND_ONE_PICKS.map((pick) => {
      const actualProspectId = actualPicks[pick.number] ?? null;
      const myProspectId = mockPredictions[pick.number] ?? null;
      const actualPickNumberForMine = myProspectId
        ? Number(Object.entries(actualPicks).find(([, prospectId]) => prospectId === myProspectId)?.[0] ?? 0)
        : 0;

      return {
        pick,
        actualProspect: actualProspectId ? getProspectById(actualProspectId) : null,
        myProspect: myProspectId ? getProspectById(myProspectId) : null,
        myState: myProspectId
          ? (function () {
              if (actualPickNumberForMine) {
                const distance = Math.abs(pick.number - actualPickNumberForMine);
                if (distance === 0) return "exact";
                if (distance === 1) return "one-away";
                if (distance === 2) return "two-away";
                return "out-of-range";
              }
              if (Object.values(actualPicks).includes(myProspectId)) return "out-of-range";
              if (draftFeed.current_pick_number >= pick.number + 3) return "out-of-range";
              return "in-play";
            })()
          : "out-of-range",
        opponents: opponentMembers.map((member) => {
          const predictions = getMemberMockPredictions(pool.id, member.id);
          const prospectId = predictions[pick.number] ?? null;
          const actualPickNumber = prospectId
            ? Number(Object.entries(actualPicks).find(([, actualId]) => actualId === prospectId)?.[0] ?? 0)
            : 0;

          let state = "out-of-range";
          if (prospectId) {
            if (actualPickNumber) {
              const distance = Math.abs(pick.number - actualPickNumber);
              if (distance === 0) state = "exact";
              else if (distance === 1) state = "one-away";
              else if (distance === 2) state = "two-away";
            } else if (!Object.values(actualPicks).includes(prospectId) && draftFeed.current_pick_number < pick.number + 3) {
              state = "in-play";
            }
          }

          return {
            id: member.id,
            name: member.name,
            prospect: prospectId ? getProspectById(prospectId) : null,
            state,
          };
        }),
      };
    });
  }, [draftFeed.actual_picks, draftFeed.current_pick_number, memberList, mockPredictions, mockPredictionsStore, pool]);

  const value = useMemo(
    () => ({
      pool,
      allPools,
      members,
      memberList,
      isLoading,
      draftFeed,
      bigBoardIds,
      livePredictions,
      liveSelections,
      liveCards,
      mockPredictions,
      hasSubmittedMock,
      liveStandings,
      currentLivePoolState,
      mockStandings,
      mockTrackingRows,
      createPool,
      seedDemoPools,
      joinPool,
      switchPool,
      updatePoolSettings,
      updatePoolMeta,
      saveBigBoard,
      moveBigBoardItem,
      saveLivePrediction,
      setLiveCurrentSelection,
      submitLiveCard,
      saveMockPrediction,
      submitMockPredictions,
      resetMockPredictions,
      startDraftNight,
      setDraftPhase,
      setCurrentPickNumber,
      setPickStatus,
      overrideTeamOnClock,
      clearTeamOverride,
      revealCurrentPick,
      rollbackPick,
      advanceDraft,
      resetDraftFeed,
    }),
    [
      allPools,
      bigBoardIds,
      currentLivePoolState,
      draftFeed,
      hasSubmittedMock,
      isLoading,
      liveStandings,
      liveCards,
      livePredictions,
      liveSelections,
      memberList,
      members,
      mockPredictions,
      mockTrackingRows,
      mockStandings,
      pool,
    ]
  );

  return <PoolContext.Provider value={value}>{children}</PoolContext.Provider>;
}
