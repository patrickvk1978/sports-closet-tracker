function hasSeriesStarted(seriesItem) {
  const totalWins = (seriesItem?.wins?.home ?? 0) + (seriesItem?.wins?.away ?? 0);
  if (totalWins > 0) return true;
  return Boolean(seriesItem?.status && seriesItem.status !== "scheduled");
}

function hasSeriesLockPassed(seriesItem) {
  const lockAt = seriesItem?.schedule?.lockAt ?? null;
  if (!lockAt) return false;
  const date = new Date(lockAt);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() >= date.getTime();
}

export function isSeriesPickPublic(seriesItem, settings = {}) {
  if (!seriesItem) return false;
  const roundLocks = settings.round_locks ?? {};
  if (roundLocks[seriesItem.roundKey]) return true;
  return hasSeriesStarted(seriesItem) || hasSeriesLockPassed(seriesItem);
}

export function areRoundPicksPublic(roundSeries = [], roundKey, settings = {}) {
  const roundLocks = settings.round_locks ?? {};
  if (roundLocks[roundKey]) return true;
  return roundSeries.some((seriesItem) => isSeriesPickPublic(seriesItem, settings));
}
