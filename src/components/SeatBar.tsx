import type { World } from '../types/sim'

export function SeatBar({ world, onOpenStats }: {
  world: World
  onOpenStats: () => void
}) {
  const majority = world.stats.councilMajority
  const total = world.constituencies.length
  const playerPartyId = world.playerPartyId

  const govLabel = (() => {
    if (world.coalitionPartnerId) {
      const partner = world.parties.find((p) => p.id === world.coalitionPartnerId)
      return `Coalition with ${partner?.name ?? world.coalitionPartnerId}`
    }
    if (world.minorityGovernment) return 'Minority Government'
    if (world.needsCoalition) return 'Hung Council'
    if (world.isGoverning) return 'Majority Government'
    return null
  })()

  return (
    <div className="seat-bar-wrap">
      <button
        className="seat-bar"
        type="button"
        onClick={onOpenStats}
        title="Click to see full statistics"
      >
        <span className="seat-bar-label">Council seats</span>
        <div className="seat-bar-track">
          {world.nationalResults.map((r) => (
            <div
              key={r.partyId}
              className={`seat-bar-segment${r.partyId === playerPartyId ? ' is-player' : ''}`}
              style={{
                width: `${(r.seatsWon / total) * 100}%`,
                background: r.colour,
              }}
              title={`${r.partyName}: ${r.seatsWon} seats`}
            />
          ))}
          {(() => {
            const filled = world.nationalResults.reduce((s, r) => s + r.seatsWon, 0)
            const empty = total - filled
            return empty > 0 ? (
              <div
                className="seat-bar-segment empty"
                style={{ width: `${(empty / total) * 100}%` }}
              />
            ) : null
          })()}
        </div>
        <span className="seat-bar-majority-label">{govLabel ? `${govLabel} · ` : ''}{majority} for majority</span>
        <span className="seat-bar-expand-hint">{'📊'}</span>
      </button>
    </div>
  )
}
