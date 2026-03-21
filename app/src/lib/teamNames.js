export function displayTeamName(name, abbrev) {
  return abbrev || name || "TBD";
}

export function matchupLabel(team1, team2, abbrev1, abbrev2) {
  return `${displayTeamName(team1, abbrev1)} vs ${displayTeamName(team2, abbrev2)}`;
}

export function seededTeamLabel(name, seed, abbrev) {
  const label = displayTeamName(name, abbrev);
  return seed ? `${label} (${seed})` : label;
}
