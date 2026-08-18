import { useState } from 'react'
import { electedSeatCounts, loadCouncillorTenure, partyArchetypeLabel } from '../lib/sim'
import { explainPlayerPartyAffinity, explainNpcPartyAffinity } from '../sim/politics/relationships'
import { VoteHistoryChart } from './VoteHistoryChart'
import { SeatHistoryChart } from './SeatHistoryChart'
import type { World } from '../types/sim'

interface StatisticsModalProps {
  world: World
  onClose: () => void
}

export function StatisticsModal({ world, onClose }: StatisticsModalProps) {
  const [selectedPartyId, setSelectedPartyId] = useState<string>('')
  const otherParties = world.parties.filter((p) => p.id !== world.playerPartyId)
  const [affinityPartyA, setAffinityPartyA] = useState<string>(world.playerPartyId)
  const [affinityPartyB, setAffinityPartyB] = useState<string>(otherParties[0]?.id ?? '')
  const majority = world.stats.councilMajority
  const total = world.constituencies.length
  const playerPartyId = world.playerPartyId
  const electedSeats = electedSeatCounts(world)

  const sortedByMargin = [...world.constituencies].sort((a, b) => a.margin - b.margin)
  const closest = sortedByMargin.slice(0, 7)
  const safest = [...sortedByMargin].sort((a, b) => b.margin - a.margin).slice(0, 7)

  const firstHistory = world.voteHistory[0]
  const voteDeltaByParty = new Map<string, number>()
  for (const r of world.nationalResults) {
    voteDeltaByParty.set(r.partyId, firstHistory ? (r.voteShare - (firstHistory.partyShares[r.partyId] ?? 0)) : 0)
  }

  const leader = world.nationalResults[0]
  const playerResult = world.nationalResults.find((r) => r.partyId === playerPartyId)
  const projectedSeatsNeeded = playerResult ? Math.max(0, majority - playerResult.seatsWon) : majority
  const playerParty = world.parties.find((p) => p.id === playerPartyId)

  const standingsByElectedSeats = [...world.nationalResults]
    .map((r) => ({
      ...r,
      electedSeats: electedSeats[r.partyId] ?? 0,
      voteDelta: voteDeltaByParty.get(r.partyId) ?? 0,
    }))
    .sort((a, b) => b.electedSeats - a.electedSeats || b.voteShare - a.voteShare)

  const selectedParty = world.parties.find((p) => p.id === selectedPartyId)
  const partyWards = selectedParty
    ? world.constituencies
        .map((c) => {
          const result = c.results.find((r) => r.partyId === selectedPartyId)
          return { ward: c, share: result?.voteShare ?? 0, isLeading: c.leadingPartyId === selectedPartyId }
        })
        .filter((e) => e.share > 0)
        .sort((a, b) => b.share - a.share)
    : []

  const partySeatsHeld = electedSeats[selectedPartyId] ?? 0
  const partySeatsLeading = world.constituencies.filter((c) => c.leadingPartyId === selectedPartyId).length
  const partyVoteShare = world.nationalResults.find((r) => r.partyId === selectedPartyId)?.voteShare ?? 0
  const partyBestWard = partyWards[0]
  const partyWorstWard = partyWards[partyWards.length - 1]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="stats-modal-title">
        <div className="stats-modal-header">
          <div className="stats-modal-title-row">
            <div>
              <span className="modal-kicker">Campaign Statistics</span>
              <h2 id="stats-modal-title">{world.townName} Council</h2>
            </div>
            <div className="stats-modal-meta">
              <span>Week {world.week}</span>
              <span>{total} wards</span>
              <span>{majority} for majority</span>
              <span>{world.weeksUntilElection} wk to election</span>
              <span>{world.stats.battlegroundWardIds.length} battlegrounds</span>
              <span>{(world.stats.averageTurnout * 100).toFixed(1)}% turnout</span>
              <button className="ink-button secondary small" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>

        <div className="stats-modal-body">
          <div className="stats-section">
            <div className="stats-section-label">Council seats</div>
            <div className="stats-seat-bar">
              {standingsByElectedSeats.filter((r) => r.electedSeats > 0).map((r) => (
                <div
                  key={r.partyId}
                  className={`stats-seat-bar-seg${r.partyId === playerPartyId ? ' is-player' : ''}`}
                  style={{ width: `${(r.electedSeats / total) * 100}%`, background: r.colour }}
                  title={`${r.partyName}: ${r.electedSeats} seats`}
                />
              ))}
              {(() => {
                const filled = Object.values(electedSeats).reduce((s, n) => s + n, 0)
                const empty = total - filled
                return empty > 0 ? (
                  <div className="stats-seat-bar-seg empty" style={{ width: `${(empty / total) * 100}%` }} />
                ) : null
              })()}
              <div className="stats-seat-majority" style={{ left: `${(majority / total) * 100}%` }} />
            </div>
          </div>

          <div className="stats-two-col">
            <div className="stats-section">
              <div className="stats-section-label">Standings (seats won)</div>
              <div className="stats-standings">
                {standingsByElectedSeats.map((r, rank) => {
                  const isPlayer = r.partyId === playerPartyId
                  const atMajority = r.electedSeats >= majority
                  return (
                    <div
                      key={r.partyId}
                      className={`stats-stand-row${isPlayer ? ' is-player' : ''}${atMajority ? ' at-majority' : ''}`}
                    >
                      <span className="stats-stand-rank">#{rank + 1}</span>
                      <span className="stats-stand-swatch" style={{ background: r.colour }} />
                      <span className="stats-stand-name">{r.partyName}</span>
                      <span className="stats-stand-leader">{r.leader}</span>
                      <span className="stats-stand-seats">{r.electedSeats}</span>
                      <span className="stats-stand-share">{r.voteShare.toFixed(1)}%</span>
                      <span className={`stats-stand-delta${Math.abs(r.voteDelta) > 0.1 ? (r.voteDelta > 0 ? ' up' : ' down') : ''}`}>
                        {Math.abs(r.voteDelta) > 0.1
                          ? `${r.voteDelta > 0 ? '+' : ''}${r.voteDelta.toFixed(1)}`
                          : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="stats-section">
              <div className="stats-section-label">If the election were held today</div>
              <div className="stats-projection">
                <div className="stats-proj-header">
                  {leader && (
                    <div className="stats-proj-outcome">
                      <span className="stats-proj-leader-swatch" style={{ background: leader.colour }} />
                      <span>
                        <strong>{leader.partyName}</strong> would win {leader.seatsWon} seats
                        {leader.seatsWon >= majority ? ' — MAJORITY' : ` — need ${majority} for majority`}
                      </span>
                    </div>
                  )}
                  {playerResult && (
                    <div className="stats-proj-player">
                      <span className="stats-proj-player-swatch" style={{ background: playerParty?.colour ?? 'var(--ink-soft)' }} />
                      <span>
                        {playerParty?.name ?? 'You'} — {playerResult.seatsWon} seats
                        {projectedSeatsNeeded > 0 ? ` (need ${projectedSeatsNeeded} more)` : ' — MAJORITY'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {world.electionsHeld >= 1 && (() => {
            const tenure = loadCouncillorTenure(world.seed)
            const reElected: Array<{ ward: string; wardId: string; name: string; party: string; colour: string; terms: number }> = []
            const defeated: Array<{ ward: string; wardId: string; name: string; party: string; colour: string; terms: number }> = []
            const newFaces: Array<{ ward: string; name: string; party: string; colour: string }> = []
            const heldBySameParty: Array<{ ward: string; name: string; party: string; colour: string; terms: number }> = []

            for (const r of world.electionNightResults) {
              const prevName = r.previousWinnerCandidateName
              const currName = r.winner?.name
              const prevParty = r.previousWinnerPartyName
              const currParty = r.winner?.partyName
              const currColour = r.winner?.partyColour
              const t = tenure[r.wardId]
              const currTerms = t?.name === currName ? t.termsServed : 0

              if (prevName && currName && prevParty === currParty && prevName === currName) {
                reElected.push({ ward: r.wardName, wardId: r.wardId, name: currName, party: currParty, colour: currColour, terms: currTerms })
              } else if (prevName && currName && prevParty === currParty && prevName !== currName) {
                heldBySameParty.push({ ward: r.wardName, name: currName, party: currParty, colour: currColour, terms: currTerms })
              } else if (prevName && prevParty !== currParty) {
                const prevTerms = prevName === t?.name ? 0 : (t?.history.find((h) => h.name === prevName)?.termsServed ?? 0)
                defeated.push({ ward: r.wardName, wardId: r.wardId, name: prevName, party: prevParty ?? '?', colour: r.previousWinnerColour ?? 'var(--ink-soft)', terms: prevTerms })
                if (currName) {
                  newFaces.push({ ward: r.wardName, name: currName, party: currParty ?? '?', colour: currColour })
                }
              } else if (currName && !prevName) {
                newFaces.push({ ward: r.wardName, name: currName, party: currParty ?? '?', colour: currColour })
              }
            }

            reElected.sort((a, b) => b.terms - a.terms)
            defeated.sort((a, b) => b.terms - a.terms)

            return (
              <div className="stats-section">
                <div className="stats-section-label">Councillor turnover</div>
                <div className="stats-grid-three">
                  <div className="stats-grid-card">
                    <div className="stats-grid-card-label">
                      Re-elected ({reElected.length})
                    </div>
                    {reElected.length === 0 ? (
                      <span className="stats-empty-hint">No councillors were re-elected.</span>
                    ) : (
                      <div className="stats-incumbency-list">
                        {reElected.map((c, i) => (
                          <div key={i} className="stats-incumbency-row">
                            <span className="stats-incumbency-swatch" style={{ background: c.colour }} />
                            <span className="stats-incumbency-name">{c.name}{c.terms > 0 ? ` · ${c.terms} term${c.terms !== 1 ? 's' : ''}` : ''}</span>
                            <span className="stats-incumbency-ward">{c.ward}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="stats-grid-card">
                    <div className="stats-grid-card-label">
                      New faces ({newFaces.length})
                    </div>
                    {newFaces.length === 0 ? (
                      <span className="stats-empty-hint">No new councillors this election.</span>
                    ) : (
                      <div className="stats-incumbency-list">
                        {newFaces.map((c, i) => (
                          <div key={i} className="stats-incumbency-row">
                            <span className="stats-incumbency-swatch" style={{ background: c.colour }} />
                            <span className="stats-incumbency-name">{c.name}</span>
                            <span className="stats-incumbency-ward">{c.ward}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="stats-grid-card">
                    <div className="stats-grid-card-label">
                      Defeated ({defeated.length})
                    </div>
                    {defeated.length === 0 ? (
                      <span className="stats-empty-hint">All incumbents held their seats.</span>
                    ) : (
                      <div className="stats-incumbency-list">
                        {defeated.map((c, i) => (
                          <div key={i} className="stats-incumbency-row">
                            <span className="stats-incumbency-swatch" style={{ background: c.colour }} />
                            <span className="stats-incumbency-name">{c.name}{c.terms > 0 ? ` · ${c.terms} term${c.terms !== 1 ? 's' : ''}` : ''}</span>
                            <span className="stats-incumbency-ward">{c.ward}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {heldBySameParty.length > 0 && (
                    <div className="stats-grid-card">
                      <div className="stats-grid-card-label">
                        Same party, new candidate ({heldBySameParty.length})
                      </div>
                      <div className="stats-incumbency-list">
                        {heldBySameParty.map((c, i) => (
                          <div key={i} className="stats-incumbency-row">
                            <span className="stats-incumbency-swatch" style={{ background: c.colour }} />
                            <span className="stats-incumbency-name">{c.name}{c.terms > 0 ? ` · ${c.terms} term${c.terms !== 1 ? 's' : ''}` : ''}</span>
                            <span className="stats-incumbency-ward">{c.ward}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          <div className="stats-grid-two">
            <div className="stats-grid-card">
              <div className="stats-grid-card-label">Closest seats</div>
              <div className="stats-seat-list">
                {closest.map((c) => {
                  const seatLeader = c.results[0]
                  const runnerUp = c.results[1]
                  const isBg = world.stats.battlegroundWardIds.includes(c.id)
                  return (
                    <div key={c.id} className={`stats-seat-row${isBg ? ' is-battleground' : ''}`}>
                      <div className="stats-seat-top">
                        <span className="stats-seat-name">{c.name}</span>
                        <span className="stats-seat-margin">{c.margin.toFixed(1)}pts</span>
                      </div>
                      <div className="stats-seat-bottom">
                        <span className="stats-seat-leader" style={{ color: seatLeader?.colour ?? 'var(--ink)' }}>
                          {seatLeader?.partyName ?? '—'}
                        </span>
                        {runnerUp && (
                          <span className="stats-seat-runnerup">vs {runnerUp.partyName} ({runnerUp.voteShare.toFixed(1)}%)</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="stats-grid-card">
              <div className="stats-grid-card-label">Safest seats</div>
              <div className="stats-seat-list">
                {safest.map((c) => {
                  const seatLeader = c.results[0]
                  return (
                    <div key={c.id} className="stats-seat-row">
                      <div className="stats-seat-top">
                        <span className="stats-seat-name">{c.name}</span>
                        <span className="stats-seat-margin safe">{c.margin.toFixed(1)}pts</span>
                      </div>
                      <div className="stats-seat-bottom">
                        <span className="stats-seat-leader" style={{ color: seatLeader?.colour ?? 'var(--ink)' }}>
                          {seatLeader?.partyName ?? '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {world.voteHistory.length >= 2 && (
            <div className="stats-section">
              <div className="stats-section-label">Vote share over time</div>
              <VoteHistoryChart world={world} tall />
            </div>
          )}

          {(world.electionSeatHistory?.length ?? 0) >= 1 && (
            <div className="stats-section">
              <div className="stats-section-label">Seats over time</div>
              <SeatHistoryChart world={world} />
            </div>
          )}

          {world.politicianMode && (
            <div className="stats-section">
              <div className="stats-section-label">Party relations</div>
              <div className="affinity-picker">
                <div className="affinity-picker-selects">
                  <label>
                    <span className="affinity-picker-label">Party A</span>
                    <select value={affinityPartyA} onChange={(e) => setAffinityPartyA(e.target.value)}>
                      {world.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <span className="affinity-picker-arrow">→</span>
                  <label>
                    <span className="affinity-picker-label">Party B</span>
                    <select value={affinityPartyB} onChange={(e) => setAffinityPartyB(e.target.value)}>
                      {world.parties.filter((p) => p.id !== affinityPartyA).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                </div>
                {(() => {
                  const isPlayerA = affinityPartyA === world.playerPartyId
                  const isPlayerB = affinityPartyB === world.playerPartyId
                  const explanation = isPlayerA
                    ? explainPlayerPartyAffinity(world, affinityPartyB)
                    : isPlayerB
                      ? explainPlayerPartyAffinity(world, affinityPartyA)
                      : explainNpcPartyAffinity(world, affinityPartyA, affinityPartyB)
                  const warmth = explanation.score >= 65 ? 'warm' : explanation.score <= 35 ? 'cool' : 'neutral'
                  const partyAName = world.parties.find((p) => p.id === affinityPartyA)?.name ?? '?'
                  const partyBName = world.parties.find((p) => p.id === affinityPartyB)?.name ?? '?'
                  return (
                    <div className={`affinity-result affinity-${warmth}`}>
                      <div className="affinity-result-score">{explanation.score}<span className="affinity-result-max"> / 100</span></div>
                      <div className="affinity-result-title">{partyAName}'s opinion of {partyBName}</div>
                      <ul className="affinity-result-reasons">
                        {explanation.components.map((c, i) => (
                          <li key={i}>{c.label}: <strong>{c.value}</strong></li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          <div className="stats-section">
            <div className="stats-section-label">Party detail</div>
            <div className="stats-party-filter">
              {world.parties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`stats-party-chip${p.id === selectedPartyId ? ' is-active' : ''}`}
                  style={p.id === selectedPartyId ? { borderColor: p.colour } : undefined}
                  aria-pressed={p.id === selectedPartyId}
                  onClick={() => setSelectedPartyId(p.id === selectedPartyId ? '' : p.id)}
                >
                  <span className="stats-party-chip-swatch" style={{ background: p.colour }} />
                  <span className="stats-party-chip-name">{p.name}</span>
                </button>
              ))}
            </div>

            {selectedParty && (
              <div className="stats-party-detail">
                <div className="stats-party-detail-header">
                  <span className="stats-party-detail-swatch" style={{ background: selectedParty.colour }} />
                  <strong>{selectedParty.name}</strong>
                  <span className="stats-party-detail-leader">{selectedParty.leader}</span>
                </div>
                <p className="stats-party-archetype">
                  {partyArchetypeLabel(selectedParty.archetype, selectedParty.issueFocus)}
                  {' · '}
                  {selectedParty.footing}
                </p>
                {selectedParty.slogan && <p className="stats-party-slogan">{selectedParty.slogan}</p>}

                <div className="stats-party-metrics">
                  <div className="stats-party-metric">
                    <span className="spm-label">Vote share</span>
                    <span className="spm-value">{partyVoteShare.toFixed(1)}%</span>
                  </div>
                  <div className="stats-party-metric">
                    <span className="spm-label">Council seats</span>
                    <span className="spm-value">{partySeatsHeld}</span>
                  </div>
                  <div className="stats-party-metric">
                    <span className="spm-label">Wards leading</span>
                    <span className="spm-value">{partySeatsLeading}</span>
                  </div>
                  <div className="stats-party-metric">
                    <span className="spm-label">Strongest</span>
                    <span className="spm-value">{partyBestWard ? `${partyBestWard.ward.name} (${partyBestWard.share.toFixed(1)}%)` : '—'}</span>
                  </div>
                  <div className="stats-party-metric">
                    <span className="spm-label">Weakest</span>
                    <span className="spm-value">{partyWorstWard ? `${partyWorstWard.ward.name} (${partyWorstWard.share.toFixed(1)}%)` : '—'}</span>
                  </div>
                </div>

                <div className="stats-party-wards">
                  <div className="stats-party-wards-label">All wards for {selectedParty.name}</div>
                  <div className="stats-party-wards-list">
                    {partyWards.length === 0 ? (
                      <span className="stats-empty-hint">No votes recorded yet.</span>
                    ) : (
                      partyWards.map((e) => (
                        <div key={e.ward.id} className={`stats-party-ward-row${e.isLeading ? ' is-leading' : ''}`}>
                          <span className="spw-name">{e.ward.name}</span>
                          <div className="spw-bar-wrap">
                            <div className="spw-bar" style={{ width: `${Math.min(100, e.share)}%`, background: selectedParty.colour }} />
                          </div>
                          <span className="spw-share">{e.share.toFixed(1)}%</span>
                          {e.isLeading && <span className="spw-leading-badge">LEAD</span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
