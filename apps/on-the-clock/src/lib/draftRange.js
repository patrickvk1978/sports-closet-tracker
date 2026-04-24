function numericEnv(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getDraftPickRange(picks = []) {
  const configuredStart = numericEnv(import.meta.env.VITE_DRAFT_PICK_START);
  const configuredEnd = numericEnv(import.meta.env.VITE_DRAFT_PICK_END);
  const dbStart = picks[0]?.number ?? null;
  const dbEnd = picks[picks.length - 1]?.number ?? null;

  const start = configuredStart ?? dbStart ?? 1;
  const end = configuredEnd ?? dbEnd ?? 32;

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

export function clampDraftPickNumber(pickNumber, picks = []) {
  const { start, end } = getDraftPickRange(picks);
  return Math.max(start, Math.min(Number(pickNumber) || start, end));
}
