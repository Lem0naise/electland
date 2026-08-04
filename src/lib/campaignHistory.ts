import type { Constituency, ConstituencyResult, World } from '../types/sim'

const HISTORY_CYCLES = 3

/** First week of the current election campaign (inclusive). */
export function campaignCycleStartWeek(world: World): number {
  const elapsed = world.electionCycleWeeks - world.weeksUntilElection
  return Math.max(1, world.week - elapsed)
}

/** First week of the N-cycle history window (inclusive). */
export function multiCycleHistoryStartWeek(world: World, cycles = HISTORY_CYCLES): number {
  const currentStart = campaignCycleStartWeek(world)
  return Math.max(1, currentStart - (cycles - 1) * world.electionCycleWeeks)
}

export function filterCampaignHistory<T extends { week: number }>(
  entries: T[],
  world: World,
  cycles = HISTORY_CYCLES,
): T[] {
  const start = multiCycleHistoryStartWeek(world, cycles)
  return entries.filter((entry) => entry.week >= start)
}

/** Week numbers of elections that fall within a history series (for chart markers). */
export function electionBoundaryWeeks(historyWeeks: number[], world: World): number[] {
  if (historyWeeks.length === 0 || world.electionsHeld < 1) return []
  const cycle = world.electionCycleWeeks
  // After an election advance, campaignCycleStartWeek equals the election-night week
  // (merged.week when weeksUntilElection reset to electionCycleWeeks).
  const lastElectionWeek = campaignCycleStartWeek(world)
  if (lastElectionWeek < 1) return []

  const minWeek = historyWeeks[0]
  const weekSet = new Set(historyWeeks)
  const boundaries: number[] = []
  for (let week = lastElectionWeek; week >= minWeek; week -= cycle) {
    if (weekSet.has(week)) boundaries.push(week)
  }
  return boundaries
}

type WardHistoryEntry = Constituency['history'][number]

export function wardHistoryDatasets(world: World, constituency: Constituency) {
  const history = filterCampaignHistory(constituency.history, world) as WardHistoryEntry[]
  const labels = history.map((entry) => `Wk ${entry.week}`)
  const partyIds = [...new Set(history.flatMap((entry) => entry.results.map((result: ConstituencyResult) => result.partyId)))]
  const incumbentPartyId = world.electionsHeld >= 1
    ? world.electionNightResults.find((entry) => entry.wardId === constituency.id)?.winner?.partyId
    : undefined

  const datasets = partyIds.map((partyId) => {
    const party = world.parties.find((entry) => entry.id === partyId)
    const colour = party?.colour
      ?? history.flatMap((entry) => entry.results).find((result) => result.partyId === partyId)?.colour
      ?? '#888'
    return {
      label: party?.name ?? partyId,
      colour,
      emphasize: partyId === world.playerPartyId || partyId === incumbentPartyId,
      data: history.map((entry) => {
        const result = entry.results.find((row) => row.partyId === partyId)
        return result ? result.voteShare : null
      }),
    }
  })

  return { labels, datasets, history, boundaryWeeks: electionBoundaryWeeks(history.map((e) => e.week), world) }
}
