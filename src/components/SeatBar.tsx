import { memo } from 'react'
import { governingStatusLabel } from '../lib/sim'
import type { World } from '../types/sim'

export const SeatBar = memo(function SeatBar({ world, onOpenStats, onOpenDashboard }: {
  world: World
  onOpenStats: () => void
  onOpenDashboard: () => void
}) {
  const majority = world.stats.councilMajority
  const total = world.constituencies.length
  const playerPartyId = world.playerPartyId
  const isGoverning = world.isGoverning
  const govLabel = governingStatusLabel(world)

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
  const leading = world.nationalResults[0]
  const hasMajority = (leading?.seatsWon ?? 0) >= majority

  const isPoliticianMode = Boolean(world.politicianMode)
  const pol = world.politicianMode?.politician

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
          {isPoliticianMode && pol && (
            <span className="seat-bar-pol-status">
              {pol.isIncumbent ? 'Seated' : 'Campaigning'} · {pol.careerTier.replace('-', ' ')}
              {pol.isIncumbent && ` · ${pol.influence} influence`}
            </span>
          )}
          <span className="seat-bar-gov-label">
            <span className="seat-bar-gov-dot" />
            {govLabel}
          </span>
          <span className="seat-bar-meta">
            {hasMajority
              ? `${leading?.partyName ?? 'Leading party'} holds ${leading?.seatsWon ?? 0}/${total} seats`
              : `Hung council · ${majority} seats for a majority`}
          </span>
          <div className="seat-bar-actions">
            {isGoverning && !isPoliticianMode && (
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
