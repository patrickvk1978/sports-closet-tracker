import { createElement, createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const ReferenceDataContext = createContext(null);

export function ReferenceDataProvider({ children }) {
  const [teams, setTeams] = useState({});        // keyed by team code
  const [prospects, setProspects] = useState([]); // array
  const [picks, setPicks] = useState([]);          // array sorted by pick_number
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [teamsResult, prospectsResult, picksResult] = await Promise.all([
        supabase.from("nfl_teams").select("*"),
        supabase.from("prospects").select("*").order("consensus_rank", { ascending: true }),
        supabase.from("round_1_picks").select("*").order("pick_number", { ascending: true }),
      ]);

      if (teamsResult.data) {
        const byCode = {};
        for (const t of teamsResult.data) {
          byCode[t.code] = { code: t.code, name: t.name, needs: t.needs ?? [] };
        }
        setTeams(byCode);
      }

      if (prospectsResult.data) setProspects(prospectsResult.data);
      if (picksResult.data) {
        setPicks(
          picksResult.data.map((p) => ({
            number: p.pick_number,
            originalTeam: p.original_team,
            currentTeam: p.current_team,
          }))
        );
      }

      setLoading(false);
    }
    load();
  }, []);

  // Helpers that mirror the draftData.js API so callers don't change shape
  const getProspectById = useMemo(
    () => (id) => prospects.find((p) => p.id === id) ?? null,
    [prospects]
  );

  const getPickLabel = useMemo(
    () => (pickNumber) => {
      const pick = picks.find((p) => p.number === pickNumber);
      if (!pick) return `Pick ${pickNumber}`;
      return `${teams[pick.currentTeam]?.name ?? pick.currentTeam} (${pick.number})`;
    },
    [picks, teams]
  );

  const defaultBigBoardIds = useMemo(() => prospects.map((p) => p.id), [prospects]);

  const value = { teams, prospects, picks, loading, getProspectById, getPickLabel, defaultBigBoardIds };

  return createElement(ReferenceDataContext.Provider, { value }, children);
}

export function useReferenceData() {
  const ctx = useContext(ReferenceDataContext);
  if (!ctx) throw new Error("useReferenceData must be used inside ReferenceDataProvider");
  return ctx;
}
