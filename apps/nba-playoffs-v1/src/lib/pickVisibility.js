export function areRoundPicksPublic(roundSeries = [], roundKey, settings = {}) {
  const roundLocks = settings.round_locks ?? {};
  if (roundLocks[roundKey]) return true;

  return roundSeries.some((seriesItem) => {
    const totalWins = (seriesItem.wins?.home ?? 0) + (seriesItem.wins?.away ?? 0);
    return totalWins > 0 || (seriesItem.status && seriesItem.status !== "scheduled");
  });
}
