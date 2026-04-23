/**
 * useSubmitWindow — drives the 20-second pool submit window.
 *
 * The window opens when draft_feed.current_status flips to 'pick_is_in'.
 * The DB trigger auto-stamps pick_is_in_at at that moment so all clients
 * count down from the same absolute timestamp.
 *
 * Returns:
 *   secondsLeft  number | null  — null when window is inactive
 *   tier         'calm' | 'active' | 'urgent' | null
 *   isActive     bool — true while window is counting
 *   callFinalize () => void — call this when your timer hits 0
 *
 * Tier logic:
 *   calm   = you're locked AND everyone else is locked
 *   active = you're locked but others aren't (or >5s left)
 *   urgent = <5s left AND at least one member still unlocked
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const WINDOW_SECONDS = 20;

export function useSubmitWindow({
  draftFeed,       // from useDraftFeed — includes pick_is_in_at, current_status, current_pick_number
  currentLocked,   // bool — is the current user locked for this pick?
  poolState,       // [{ locked, isCurrentUser }] — full pool lock state
  poolId,          // uuid — current pool
}) {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const intervalRef = useRef(null);
  const hasCalledFinalizeRef = useRef(false);

  const isPickIsIn = draftFeed?.current_status === "pick_is_in";
  const pickIsInAt = draftFeed?.pick_is_in_at ?? draftFeed?.updated_at ?? null;
  const currentPickNumber = draftFeed?.current_pick_number;

  // Reset finalize flag when pick advances
  useEffect(() => {
    hasCalledFinalizeRef.current = false;
  }, [currentPickNumber]);

  const callFinalize = useCallback(async () => {
    if (hasCalledFinalizeRef.current) return;
    hasCalledFinalizeRef.current = true;
    try {
      await supabase.rpc("finalize_pick", { p_pick_number: currentPickNumber });
    } catch (err) {
      // Idempotent — safe if another client beat us to it
      console.warn("finalize_pick:", err?.message);
    }
  }, [currentPickNumber]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isPickIsIn || !pickIsInAt) {
      setSecondsLeft(null);
      return;
    }

    function tick() {
      const elapsed = (Date.now() - new Date(pickIsInAt).getTime()) / 1000;
      const left = Math.max(0, WINDOW_SECONDS - elapsed);
      setSecondsLeft(Math.ceil(left));

      if (left <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        callFinalize();
      }
    }

    tick(); // immediate first tick
    intervalRef.current = setInterval(tick, 250);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPickIsIn, pickIsInAt, callFinalize]);

  if (!isPickIsIn || secondsLeft === null) {
    return { secondsLeft: null, tier: null, isActive: false, callFinalize };
  }

  const anyoneUnlocked = poolState.some((m) => !m.locked && !m.isCurrentUser);

  const tier =
    secondsLeft <= 5 && anyoneUnlocked ? "urgent" :
    !currentLocked || anyoneUnlocked    ? "active" : "calm";

  return { secondsLeft, tier, isActive: true, callFinalize };
}
