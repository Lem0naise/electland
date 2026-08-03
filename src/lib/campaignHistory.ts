import type { Constituency, ConstituencyResult, World } from '../types/sim'

/** First week of the current election campaign (inclusive). */
export function campaignCycleStartWeek(world: World): number {
  const elapsed = world.electionCycleWeeks - world.weeksUntilElection
  return Math.max(1, world.week - elapsed)
}

export function filterCampaignHistory<T extends { week: number }>(entries: T[], world: World): T[] {
  const start = campaignCycleStartWeek(world)
  return entries.filter((entry) => entry.week >= start)
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

  return { labels, datasets, history }
}
