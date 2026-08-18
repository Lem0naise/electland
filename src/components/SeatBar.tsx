import { memo } from 'react'
import { electedSeatCounts, governingStatusLabel } from '../lib/sim'
import type { World } from '../types/sim'

export const SeatBar = memo(function SeatBar({ world, onOpenStats }: {
  world: World
  onOpenStats: () => void
}) {
  const majority = world.stats.councilMajority
  const total = world.constituencies.length
  const playerPartyId = world.playerPartyId
  const govLabel = governingStatusLabel(world)
  const seatCounts = electedSeatCounts(world)

  const partiesBySeats = [...world.parties]
    .map((p) => ({
      partyId: p.id,
      partyName: p.name,
      colour: p.colour,
      seatsWon: seatCounts[p.id] ?? 0,
    }))
    .filter((p) => p.seatsWon > 0)
    .sort((a, b) => b.seatsWon - a.seatsWon || a.partyName.localeCompare(b.partyName))

  const seatBreakdown = partiesBySeats.map((r) => (
    <div
      key={r.partyId}
      className={`seat-bar-segment${r.partyId === playerPartyId ? ' is-player' : ''}`}
      style={{ width: `${(r.seatsWon / total) * 100}%`, background: r.colour }}
      title={`${r.partyName}: ${r.seatsWon} seat${r.seatsWon !== 1 ? 's' : ''}`}
    />
  ))

  const filled = partiesBySeats.reduce((s, r) => s + r.seatsWon, 0)
  const empty = total - filled
  const leading = partiesBySeats[0]
  const hasMajority = (leading?.seatsWon ?? 0) >= majority

  const pol = world.politicianMode?.politician

  return (
    <div className="seat-bar-wrap" onClick={onOpenStats} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenStats() }}>
      <div className="seat-bar">
        <div className="seat-bar-track">
          {seatBreakdown}
          {empty > 0 && (
            <div className="seat-bar-segment empty" style={{ width: `${(empty / total) * 100}%` }} />
          )}
          <div className="seat-bar-majority-marker" style={{ left: `${(majority / total) * 100}%` }} />
        </div>

        <div className="seat-bar-info">
          {pol && (
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
          <span className="seat-bar-stats-hint">{'\uD83D\uDCCA'} Stats</span>
        </div>
      </div>
    </div>
  )
})
