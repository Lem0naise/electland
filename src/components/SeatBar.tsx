import { memo } from 'react'
import type { World } from '../types/sim'

export const SeatBar = memo(function SeatBar({ world, onOpenStats, onOpenDashboard }: {
  world: World
  onOpenStats: () => void
  onOpenDashboard: () => void
}) {
  const majority = world.stats.councilMajority
  const total = world.constituencies.length
  const playerPartyId = world.playerPartyId
  const isGoverning = world.isGoverning || !!world.coalitionPartnerId || world.minorityGovernment

  const govLabel = (() => {
    if (world.coalitionPartnerId) {
      const partner = world.parties.find((p) => p.id === world.coalitionPartnerId)
      return `Coalition · ${partner?.name ?? world.coalitionPartnerId}`
    }
    if (world.minorityGovernment) return 'Minority Government'
    if (world.needsCoalition) return 'Hung Council'
    if (world.isGoverning) return 'Majority Government'
    return null
  })()

  const seatBreakdown = world.nationalResults.map((r) => (
    <div
      key={r.partyId}
      className={`seat-bar-segment${r.partyId === playerPartyId ? ' is-player' : ''}`}
      style={{ width: `${(r.seatsWon / total) * 100}%`, background: r.colour }}
      title={`${r.partyName}: ${r.seatsWon} seat${r.seatsWon !== 1 ? 's' : ''}`}
    />
  ))

  const filled = world.nationalResults.reduce((s, r) => s + r.seatsWon, 0)
  const empty = total - filled

  return (
    <div className="seat-bar-wrap">
      <div className="seat-bar">
        <div className="seat-bar-track">
          {seatBreakdown}
          {empty > 0 && (
            <div className="seat-bar-segment empty" style={{ width: `${(empty / total) * 100}%` }} />
          )}
          <div className="seat-bar-majority-marker" style={{ left: `${(majority / total) * 100}%` }} />
        </div>

        <div className="seat-bar-info">
          {govLabel && (
            <span className="seat-bar-gov-label">
              <span className="seat-bar-gov-dot" />
              {govLabel}
            </span>
          )}
          <span className="seat-bar-meta">
            {majority} for majority · Week {world.week}
            {world.weeksUntilElection > 0 && ` · ${world.weeksUntilElection}wk to election`}
          </span>
          <div className="seat-bar-actions">
            {isGoverning && (
              <button type="button" className="seat-bar-action-btn is-gov" onClick={onOpenDashboard}>
                {'\uD83C\uDFDB'} Govern
              </button>
            )}
            <button type="button" className="seat-bar-action-btn is-stats" onClick={onOpenStats}>
              {'\uD83D\uDCCA'} Stats
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
