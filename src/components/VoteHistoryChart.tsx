import { memo } from 'react'
import { PartyShareLineChart } from './charts/PartyShareLineChart'
import { electionBoundaryWeeks, filterCampaignHistory } from '../lib/campaignHistory'
import type { World } from '../types/sim'

export const VoteHistoryChart = memo(function VoteHistoryChart({ world, tall = false }: { world: World; tall?: boolean }) {
  const history = filterCampaignHistory(world.voteHistory, world)
  if (history.length < 2) {
    return <div className="history-empty">Advance a few weeks to see vote trends.</div>
  }

  const labels = history.map((entry) => `Wk ${entry.week}`)
  const weeks = history.map((entry) => entry.week)
  const boundaries = electionBoundaryWeeks(weeks, world)
  const boundaryLabelIndices = boundaries.map((week) => weeks.indexOf(week)).filter((i) => i >= 0)
  const parties = world.nationalResults
  const datasets = parties.map((party) => ({
    label: party.partyName,
    colour: party.colour,
    emphasize: party.partyId === world.playerPartyId,
    data: history.map((entry) => entry.partyShares[party.partyId] ?? null),
  }))

  return (
    <div className="history-chart-wrap">
      <PartyShareLineChart
        labels={labels}
        datasets={datasets}
        height={tall ? 220 : 140}
        boundaryLabelIndices={boundaryLabelIndices}
      />
    </div>
  )
})
