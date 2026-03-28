const CURRENT_PLACE_KEYS = [
  'finish_probs',
  'place_probs',
  'player_finish_probs',
  'player_place_probs',
]

const PREV_PLACE_KEYS = [
  'prev_finish_probs',
  'prev_place_probs',
  'prev_player_finish_probs',
  'prev_player_place_probs',
]

export const DEFAULT_PRIZE_PLACES = [1]

function toProbability(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  if (num > 1.0001 && num <= 100) return num / 100
  return num
}

function normalizePlaceKey(key) {
  if (key == null) return null
  const raw = String(key).trim().toLowerCase()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)
  if (raw === 'win' || raw === 'winner' || raw === 'champ' || raw === 'champion' || raw === 'first' || raw === '1st') return 1
  if (raw === 'second' || raw === '2nd') return 2
  if (raw === 'third' || raw === '3rd') return 3
  if (raw === 'fourth' || raw === '4th') return 4
  if (raw === 'fifth' || raw === '5th') return 5
  return null
}

function normalizePlayerPlaceMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'object') return {}

  const normalized = {}

  for (const [playerName, places] of Object.entries(rawMap)) {
    if (!places || typeof places !== 'object') continue
    const playerPlaces = {}

    for (const [placeKey, value] of Object.entries(places)) {
      const place = normalizePlaceKey(placeKey)
      const prob = toProbability(value)
      if (!place || prob == null) continue
      playerPlaces[place] = prob
    }

    if (Object.keys(playerPlaces).length > 0) {
      normalized[playerName] = playerPlaces
    }
  }

  return normalized
}

function firstDefinedObject(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (value && typeof value === 'object') return value
  }
  return null
}

export function extractPlaceProbabilityMaps(simResult) {
  const current = normalizePlayerPlaceMap(firstDefinedObject(simResult, CURRENT_PLACE_KEYS))
  const prev = normalizePlayerPlaceMap(firstDefinedObject(simResult, PREV_PLACE_KEYS))

  if (simResult?.player_probs && typeof simResult.player_probs === 'object') {
    for (const [playerName, value] of Object.entries(simResult.player_probs)) {
      const prob = toProbability(value)
      if (prob == null) continue
      current[playerName] = { ...(current[playerName] ?? {}), 1: prob }
    }
  }

  if (simResult?.prev_player_probs && typeof simResult.prev_player_probs === 'object') {
    for (const [playerName, value] of Object.entries(simResult.prev_player_probs)) {
      const prob = toProbability(value)
      if (prob == null) continue
      prev[playerName] = { ...(prev[playerName] ?? {}), 1: prob }
    }
  }

  return { current, prev }
}

export function normalizePrizePlaces(rawPrizePlaces) {
  const values = Array.isArray(rawPrizePlaces)
    ? rawPrizePlaces
    : typeof rawPrizePlaces === 'string'
      ? rawPrizePlaces.split(',').map((value) => value.trim())
      : []

  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
        .sort((a, b) => a - b)
    )
  )
}

export function getPrizePlacesFromPool(pool) {
  const direct = normalizePrizePlaces(pool?.prize_places)
  if (direct.length > 0) return direct

  const nested = normalizePrizePlaces(pool?.scoring_config?.prize_places)
  if (nested.length > 0) return nested

  return [...DEFAULT_PRIZE_PLACES]
}

export function getPrizePlaceLabel(place) {
  if (place === 1) return '1st %'
  if (place === 2) return '2nd %'
  if (place === 3) return '3rd %'

  const suffix = place % 10 === 1 && place % 100 !== 11
    ? 'st'
    : place % 10 === 2 && place % 100 !== 12
      ? 'nd'
      : place % 10 === 3 && place % 100 !== 13
        ? 'rd'
        : 'th'

  return `${place}${suffix} %`
}

function hasPlace(players, place) {
  return players.some((player) => Number.isFinite(player.finishProbs?.[place]))
}

export function getFinishMetricOptions(players = [], prizePlaces = DEFAULT_PRIZE_PLACES) {
  const options = [{ key: 'winProb', label: 'Win %', shortLabel: 'Win %' }]
  const normalizedPrizePlaces = normalizePrizePlaces(prizePlaces)
  const maxPrizePlace = normalizedPrizePlaces[normalizedPrizePlaces.length - 1] ?? 1
  const contiguousPrizeWindow =
    maxPrizePlace > 1 &&
    normalizedPrizePlaces.length === maxPrizePlace &&
    normalizedPrizePlaces.every((place, index) => place === index + 1)

  if (hasPlace(players, 2)) {
    options.push({ key: 'place2Prob', label: '2nd %', shortLabel: '2nd %' })
  }

  if (hasPlace(players, 3)) {
    options.push({ key: 'place3Prob', label: '3rd %', shortLabel: '3rd %' })
  }

  if (contiguousPrizeWindow && hasPlace(players, maxPrizePlace)) {
    options.push({ key: 'anyPrizeProb', label: 'Any Prize %', shortLabel: 'Any Prize %' })
  }

  normalizedPrizePlaces.forEach((place) => {
    if (place > 3 && hasPlace(players, place)) {
      options.push({
        key: `place${place}Prob`,
        label: getPrizePlaceLabel(place),
        shortLabel: getPrizePlaceLabel(place),
      })
    }
  })

  return options
}

export function getPrimaryStandingsMetrics(players = [], prizePlaces = DEFAULT_PRIZE_PLACES) {
  const options = getFinishMetricOptions(players, prizePlaces)
  const byKey = new Map(options.map((option) => [option.key, option]))
  const primary = []

  if (byKey.has('winProb')) primary.push(byKey.get('winProb'))
  if (byKey.has('anyPrizeProb')) primary.push(byKey.get('anyPrizeProb'))

  if (primary.length === 0 && options.length > 0) {
    primary.push(options[0])
  }

  return primary
}

export function getFinishMetricValue(player, metricKey) {
  if (!player) return 0
  switch (metricKey) {
    case 'anyPrizeProb':
      return player.anyPrizeProb ?? player.winProb ?? 0
    case 'place2Prob':
      return player.finishProbs?.[2] ?? 0
    case 'place3Prob':
      return player.finishProbs?.[3] ?? 0
    case 'winProb':
      return player.winProb ?? 0
    default:
      if (/^place\d+Prob$/.test(metricKey)) {
        const place = Number(metricKey.replace('place', '').replace('Prob', ''))
        return player.finishProbs?.[place] ?? 0
      }
      return player.winProb ?? 0
  }
}

export function getFinishMetricDelta(player, metricKey) {
  if (!player) return null
  switch (metricKey) {
    case 'anyPrizeProb':
      return player.anyPrizeProbDelta ?? null
    case 'place2Prob':
      return player.finishProbDeltas?.[2] ?? null
    case 'place3Prob':
      return player.finishProbDeltas?.[3] ?? null
    case 'winProb':
      return player.winProbDelta ?? null
    default:
      if (/^place\d+Prob$/.test(metricKey)) {
        const place = Number(metricKey.replace('place', '').replace('Prob', ''))
        return player.finishProbDeltas?.[place] ?? null
      }
      return player.winProbDelta ?? null
  }
}

export function getFinishMetricColor(metricKey, value) {
  if (metricKey === 'winProb') {
    if (value > 15) return '#34d399'
    if (value > 8) return '#fbbf24'
    return '#94a3b8'
  }

  if (value > 35) return '#34d399'
  if (value > 18) return '#fbbf24'
  return '#94a3b8'
}
