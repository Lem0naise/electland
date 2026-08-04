import type { World } from '../types/sim'
import { electedSeatCounts } from '../lib/sim'

export function GovernmentDashboard({ world, onOpenBudget, onClose }: {
  world: World
  onOpenBudget: () => void
  onClose: () => void
}) {
  const budget = world.budget
  const councilHistory = world.councilHistory ?? []
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const majority = world.stats.councilMajority
  const seatCounts = electedSeatCounts(world)
  const playerSeats = seatCounts[world.playerPartyId] ?? 0

  const govLabel = (() => {
    if (world.coalitionPartnerId) {
      const p = world.parties.find((pp) => pp.id === world.coalitionPartnerId)
      return `Coalition with ${p?.name ?? '?'}`
    }
    if (world.minorityGovernment) return 'Minority Government'
    if (world.needsCoalition) return 'Hung Council — negotiations ongoing'
    if (world.isGoverning) return 'Majority Government'
    return 'Campaigning'
  })()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal gov-dashboard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-kicker">Government Dashboard</span>
          <h2>{govLabel}</h2>
          <p className="modal-sub">Week {world.week} · {world.electionsHeld} election{world.electionsHeld !== 1 ? 's' : ''} held · {majority} seats for majority</p>
        </div>

        <div className="gd-grid">
          <div className="gd-card">
            <div className="gd-card-label">Council composition</div>
            <div className="gd-seats">
              {world.parties.map((p) => {
                const seats = seatCounts[p.id] ?? 0
                if (seats === 0 && p.id !== world.playerPartyId) return null
                return (
                  <div key={p.id} className={`gd-seat-row${p.id === world.playerPartyId ? ' is-player' : ''}`}>
                    <span className="gd-swatch" style={{ background: p.colour }} />
                    <span className="gd-party-name">{p.name}</span>
                    <span className="gd-seat-count">{seats}</span>
                  </div>
                )
              })}
              <div className="gd-majority-line">Majority: {majority}</div>
            </div>
          </div>

          {budget ? (
            <div className="gd-card">
              <div className="gd-card-label">Budget allocation</div>
              <div className="gd-budget-list">
                {budget.categories.map((c) => (
                  <div key={c.id} className="gd-budget-row">
                    <span className="gd-budget-name">{c.label}</span>
                    <div className="gd-budget-bar-wrap">
                      <div className="gd-budget-bar" style={{ width: `${c.funding}%`, background: c.funding >= 60 ? '#1a5c2a' : c.funding >= 30 ? '#edae49' : 'var(--accent-red)' }} />
                    </div>
                    <span className="gd-budget-val">{c.funding}%</span>
                  </div>
                ))}
              </div>
              <button className="ink-button small" type="button" onClick={onOpenBudget} style={{ marginTop: 6 }}>
                Adjust budget
              </button>
            </div>
          ) : (
            <div className="gd-card">
              <div className="gd-card-label">Budget</div>
              <span className="gd-empty">No budget set.</span>
            </div>
          )}

          <div className="gd-card">
            <div className="gd-card-label">Recent decisions</div>
            <div className="gd-decisions">
              {councilHistory.length === 0 ? (
                <span className="gd-empty">No decisions recorded yet.</span>
              ) : (
                councilHistory.slice(-6).reverse().map((d, i) => (
                  <div key={i} className="gd-decision-row">
                    <span className="gd-decision-week">Wk {d.week}</span>
                    <span className="gd-decision-text">
                      <strong>{d.headline}</strong>: {d.choice}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="gd-card">
            <div className="gd-card-label">Your party</div>
            <div className="gd-party-stats">
              <div className="gd-stat">
                <span className="gd-stat-label">Seats</span>
                <span className="gd-stat-value">{playerSeats} of {world.constituencies.length}</span>
              </div>
              <div className="gd-stat">
                <span className="gd-stat-label">Base popularity</span>
                <span className="gd-stat-value">{(playerParty?.baseUtility ?? 0).toFixed(1)}</span>
              </div>
              <div className="gd-stat">
                <span className="gd-stat-label">Momentum</span>
                <span className="gd-stat-value">{(playerParty?.momentum ?? 0).toFixed(1)}</span>
              </div>
              <div className="gd-stat">
                <span className="gd-stat-label">Weeks to election</span>
                <span className="gd-stat-value">{world.weeksUntilElection}</span>
              </div>
            </div>
          </div>
        </div>

        <button className="ink-button secondary" type="button" onClick={onClose} style={{ marginTop: 8 }}>
          Close
        </button>
      </div>
    </div>
  )
}
