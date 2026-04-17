import { useCallback, useEffect, useMemo, useState } from 'react'

import './App.css'
import { ConstituencyInspector } from './components/ConstituencyInspector'
import { MapFigure } from './components/MapFigure'
import {
  applyCampaignAction,
  estimateTilePreference,
  generateWorld,
  getAvailableActions,
  IDEOLOGY_AXES,
  ideologySummary,
  simulateWeek,
} from './lib/sim'
import type {
  ActionResult,
  CampaignAction,
  GovernanceDecision,
  PartyDefinition,
  PopulationTile,
  World,
} from './types/sim'

type MapMode = 'ward' | 'bloc' | 'voter'

const blocPalette = ['#d94841', '#00798c', '#edae49', '#3d405b', '#81b29a', '#8d5524', '#c56b37']

function dominantBlocId(blocMix: Record<string, number>) {
  return Object.entries(blocMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function formatSigned(value: number, digits = 1) {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`
}

// ─── Ideology Widget ──────────────────────────────────────────────────────────
// Three-bar position widget showing where a party/ward sits on each axis.
// value range: -100 (left pole) to +100 (right pole)
function IdeologyWidget({ values, colour, compact = false }: {
  values: { change: number; growth: number; services: number }
  colour?: string
  compact?: boolean
}) {
  return (
    <div className={`ideology-widget${compact ? ' compact' : ''}`}>
      {IDEOLOGY_AXES.map((ax) => {
        const val = values[ax.key]
        // Map -100…+100 to 0…100%
        const pct = ((val + 100) / 200) * 100
        // Intensity: how strongly does it lean?
        const intensity = Math.abs(val)
        const dotColour = colour ?? (val > 0 ? '#2f6e2f' : val < 0 ? '#7a1c1c' : '#7a6040')
        return (
          <div key={ax.key} className="ideology-row">
            <span className={`ideology-pole left${intensity > 25 && val < 0 ? ' is-dominant' : ''}`}>
              {ax.leftLabel}
            </span>
            <div className="ideology-track">
              <div className="ideology-track-line" />
              <div
                className="ideology-dot"
                style={{
                  left: `${pct}%`,
                  background: dotColour,
                }}
                title={`${ax.leftLabel} ↔ ${ax.rightLabel}: ${val > 0 ? '+' : ''}${val.toFixed(0)}`}
              />
            </div>
            <span className={`ideology-pole right${intensity > 25 && val > 0 ? ' is-dominant' : ''}`}>
              {ax.rightLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}


function ElectionNightModal({ world, onReveal, onClose }: {
  world: World
  onReveal: () => void
  onClose: () => void
}) {
  const revealed = world.electionNightResults.slice(0, world.electionNightRevealIndex)
  const total = world.electionNightResults.length
  const done = world.electionNightRevealIndex >= total
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const majority = world.stats.councilMajority

  // Compute election-night seat counts from the actual results, not nationalResults
  // (avoids the stale-playerWon bug where seatsWon shows 0)
  const electionSeatCounts: Record<string, number> = {}
  world.electionNightResults.forEach((r) => {
    const id = r.winner?.partyId
    if (id) electionSeatCounts[id] = (electionSeatCounts[id] ?? 0) + 1
  })
  const playerElectionSeats = electionSeatCounts[world.playerPartyId] ?? 0
  const winnerPartyId = Object.entries(electionSeatCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const winnerParty = world.parties.find((p) => p.id === winnerPartyId)
  const playerWonThisElection = playerElectionSeats >= majority

  // Gains and losses (only once all results are revealed)
  const gains = world.electionNightResults.filter((r) => r.wasHeld && r.winner?.partyId === world.playerPartyId)
  const losses = world.electionNightResults.filter((r) => r.wasHeld && r.previousWinnerPartyId === world.playerPartyId)
  const otherFlips = world.electionNightResults.filter(
    (r) => r.wasHeld && r.winner?.partyId !== world.playerPartyId && r.previousWinnerPartyId !== world.playerPartyId,
  )

  // Before/after council comparison
  const prevSeats = world.electionNightPreviousSeats
  const allParties = world.parties.filter((p) =>
    (electionSeatCounts[p.id] ?? 0) > 0 || (prevSeats[p.id] ?? 0) > 0,
  ).sort((a, b) => (electionSeatCounts[b.id] ?? 0) - (electionSeatCounts[a.id] ?? 0))

  return (
    <div className="modal-backdrop">
      <div className="modal election-night-modal">
        <div className="modal-header">
          <span className="modal-kicker">Election Night</span>
          <h2>{world.townName} Council</h2>
          <p className="modal-sub">Week {world.week} · {revealed.length} of {total} results declared · {majority} seats for majority</p>
        </div>

        <div className="election-night-grid">
          {revealed.map((r) => {
            const isPlayer = r.winner?.partyId === world.playerPartyId
            const isGain = r.wasHeld && r.winner?.partyId === world.playerPartyId
            const isLoss = r.wasHeld && r.previousWinnerPartyId === world.playerPartyId
            const isFlip = r.wasHeld && !isGain && !isLoss
            return (
              <div
                key={r.wardId}
                className={[
                  'election-result-card',
                  isPlayer ? 'is-player' : '',
                  isGain ? 'is-gain' : '',
                  isLoss ? 'is-loss' : '',
                  isFlip ? 'is-flip' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="result-card-ward">{r.wardName}</div>
                {r.winner && (
                  <div className="result-card-winner" style={{ borderLeftColor: r.winner.partyColour }}>
                    <span className="result-candidate-initials" style={{ background: r.winner.partyColour }}>
                      {r.winner.initials}
                    </span>
                    <div className="result-winner-names">
                      <span className="result-candidate-name">{r.winner.name}</span>
                      <span className="result-party-name">{r.winner.partyName}</span>
                    </div>
                  </div>
                )}
                <div className="result-card-stats">
                  {r.results[0] && (
                    <span className="result-pct-row">
                      <strong className="result-pct">{r.results[0].voteShare.toFixed(1)}%</strong>
                      {r.results[1] && (
                        <span className="result-margin">+{(r.results[0].voteShare - r.results[1].voteShare).toFixed(1)} pts</span>
                      )}
                    </span>
                  )}
                  {r.swingFromLastElection != null && (
                    <span className={`result-swing ${r.swingFromLastElection >= 0 ? 'swing-up' : 'swing-down'}`}>
                      {r.swingFromLastElection >= 0 ? '▲' : '▼'} {Math.abs(r.swingFromLastElection).toFixed(1)}pp swing
                    </span>
                  )}
                </div>
                {/* Change of hands label */}
                {r.wasHeld && (
                  <div className="result-card-change">
                    {isGain && (
                      <span className="change-gain">
                        GAIN from {r.previousWinnerPartyName ?? '?'}
                        {r.previousMargin != null ? ` (was +${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    )}
                    {isLoss && (
                      <span className="change-loss">
                        LOSS to {r.winner?.partyName ?? '?'}
                        {r.previousMargin != null ? ` (overturned +${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    )}
                    {isFlip && (
                      <span className="change-flip">
                        FLIP: {r.previousWinnerPartyName ?? '?'} → {r.winner?.partyName ?? '?'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {!done && (
            <div className="election-result-card pending-card" onClick={onReveal}>
              <div className="result-card-ward">Next result...</div>
              <div className="pending-reveal">Click to reveal</div>
            </div>
          )}
        </div>

        {done && (
          <div className="election-night-summary">

            {/* Before → After council comparison */}
            {world.electionsHeld > 1 && (
              <div className="en-before-after">
                <div className="en-ba-label">Council: before → after</div>
                <div className="en-ba-rows">
                  {allParties.map((p) => {
                    const before = prevSeats[p.id] ?? 0
                    const after = electionSeatCounts[p.id] ?? 0
                    const delta = after - before
                    return (
                      <div key={p.id} className={`en-ba-row${p.id === world.playerPartyId ? ' is-player' : ''}`}>
                        <span className="en-ba-swatch" style={{ background: p.colour }} />
                        <span className="en-ba-name">{p.name}</span>
                        <span className="en-ba-before">{before}</span>
                        <span className="en-ba-arrow">→</span>
                        <span className="en-ba-after">{after}</span>
                        {delta !== 0 && (
                          <span className={`en-ba-delta ${delta > 0 ? 'up' : 'down'}`}>
                            {delta > 0 ? '+' : ''}{delta}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Gains / losses callout */}
            {(gains.length > 0 || losses.length > 0 || otherFlips.length > 0) && (
              <div className="en-flips">
                {gains.length > 0 && (
                  <div className="en-flips-section">
                    <span className="en-flips-label gain">Your gains</span>
                    {gains.map((r) => (
                      <span key={r.wardId} className="en-flip-pill gain">
                        {r.wardName} from {r.previousWinnerPartyName ?? '?'}
                        {r.previousMargin != null ? ` (+${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {losses.length > 0 && (
                  <div className="en-flips-section">
                    <span className="en-flips-label loss">Your losses</span>
                    {losses.map((r) => (
                      <span key={r.wardId} className="en-flip-pill loss">
                        {r.wardName} to {r.winner?.partyName ?? '?'}
                        {r.previousMargin != null ? ` (overturned +${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {otherFlips.length > 0 && (
                  <div className="en-flips-section">
                    <span className="en-flips-label flip">Other upsets</span>
                    {otherFlips.map((r) => (
                      <span key={r.wardId} className="en-flip-pill flip">
                        {r.wardName}: {r.previousWinnerPartyName ?? '?'} → {r.winner?.partyName ?? '?'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Final standings */}
            <div className="night-standings">
              {world.parties
                .filter((p) => (electionSeatCounts[p.id] ?? 0) > 0 || p.id === world.playerPartyId)
                .sort((a, b) => (electionSeatCounts[b.id] ?? 0) - (electionSeatCounts[a.id] ?? 0))
                .map((p) => {
                  const seats = electionSeatCounts[p.id] ?? 0
                  const isPlayer = p.id === world.playerPartyId
                  const atMajority = seats >= majority
                  return (
                    <div key={p.id} className={`night-standing${isPlayer ? ' is-player' : ''}`}>
                      <span className="swatch" style={{ background: p.colour }} />
                      <span className="night-party-name">{p.name}</span>
                      <strong className="night-seats">{seats}</strong>
                      <span className="night-seats-label">seats</span>
                      {atMajority && <span className="majority-badge">MAJORITY</span>}
                    </div>
                  )
                })}
            </div>

            {/* Verdict */}
            <div className={`election-night-verdict${playerWonThisElection ? ' verdict-win' : ' verdict-loss'}`}>
              {playerWonThisElection
                ? `${playerParty?.name ?? 'Your party'} wins the council with ${playerElectionSeats} seat${playerElectionSeats !== 1 ? 's' : ''} — a majority of ${majority}.`
                : winnerParty && winnerParty.id !== world.playerPartyId
                  ? `${winnerParty.name} wins the council with ${electionSeatCounts[winnerParty.id] ?? 0} seats. ${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} of ${majority} needed.`
                  : `No majority. ${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} of ${majority} needed.`}
            </div>

            <button className="ink-button" type="button" onClick={onClose}>
              {playerWonThisElection ? 'Govern the town' : 'Campaign continues'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Governance Modal ─────────────────────────────────────────────────────────
function GovernanceModal({ world, decisions, onDecide, onClose }: {
  world: World
  decisions: GovernanceDecision[]
  onDecide: (decisionId: string, choiceIndex: number) => void
  onClose: () => void
}) {
  const pending = decisions.filter((d) => !d.resolved)
  if (pending.length === 0) {
    return (
      <div className="modal-backdrop">
        <div className="modal governance-modal">
          <div className="modal-header">
            <span className="modal-kicker">Council Chambers</span>
            <h2>Governing {world.townName}</h2>
          </div>
          <p>All decisions resolved. Your choices will shape voter opinion before the next election.</p>
          <button className="ink-button" type="button" onClick={onClose}>Return to campaign</button>
        </div>
      </div>
    )
  }

  const current = pending[0]

  return (
    <div className="modal-backdrop">
      <div className="modal governance-modal">
        <div className="modal-header">
          <span className="modal-kicker">Council Decision</span>
          <h2>{current.headline}</h2>
          <p className="modal-sub">{current.description}</p>
        </div>
        <div className="governance-choices">
          {current.choices.map((choice, index) => (
            <button
              key={index}
              className="governance-choice-btn"
              type="button"
              onClick={() => onDecide(current.id, index)}
            >
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
              <small>{choice.effect.playerUtilityDelta > 0 ? '↑ Boosts your support' : choice.effect.playerUtilityDelta < 0 ? '↓ Risky for your party' : '→ Neutral for your party'}</small>
            </button>
          ))}
        </div>
        <p className="governance-note">{pending.length - 1} more decision{pending.length - 1 !== 1 ? 's' : ''} pending.</p>
      </div>
    </div>
  )
}

// ─── Action Flash ─────────────────────────────────────────────────────────────
function ActionFlash({ result, onDismiss }: { result: ActionResult; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3200)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className={`action-flash action-flash-${result.outcome}`} onClick={onDismiss}>
      <div className="flash-outcome-icon">
        {result.outcome === 'success' ? '✓' : result.outcome === 'backfire' ? '✗' : '~'}
      </div>
      <div className="flash-body">
        <strong>{result.outcome === 'success' ? 'Success' : result.outcome === 'backfire' ? 'Backfired!' : 'Neutral'}</strong>
        <span>{result.description}</span>
        {result.voteShareDelta !== undefined && Math.abs(result.voteShareDelta) > 0.1 && (
          <span className={`flash-delta${result.voteShareDelta > 0 ? ' positive' : ' negative'}`}>
            {formatSigned(result.voteShareDelta, 1)}pp in {result.wardName ?? 'affected wards'}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Seat Bar (horizontal TV-style election bar above the map) ───────────────
function SeatBar({ world, previousNationalById }: {
  world: World
  previousNationalById: Map<string, { voteShare: number; seatsWon: number }>
}) {
  const [expanded, setExpanded] = useState(false)
  const majority = world.stats.councilMajority
  const total = world.constituencies.length
  const playerPartyId = world.playerPartyId

  return (
    <div className="seat-bar-wrap">
      {/* The bar itself — clickable to expand */}
      <button
        className="seat-bar"
        type="button"
        onClick={() => setExpanded((e) => !e)}
        title="Click to see full standings"
        aria-expanded={expanded}
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
          {/* Empty seats (no party) */}
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
        {/* Majority line */}
        <div
          className="seat-bar-majority-line"
          style={{ left: `calc(${(majority / total) * 100}% + 56px)` }}
          title={`Majority: ${majority} seats`}
        />
        <span className="seat-bar-majority-label">{majority} for majority</span>
        <span className="seat-bar-expand-hint">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded standings dropdown */}
      {expanded && (
        <div className="seat-bar-dropdown panel">
          <div className="sbd-header">
            <span className="sbd-title">Full standings — week {world.week}</span>
            <span className="sbd-subtitle">{majority} seats needed for a majority</span>
          </div>
          <div className="sbd-rows">
            {world.nationalResults.map((result, rank) => {
              const previous = previousNationalById.get(result.partyId)
              const voteDelta = previous ? result.voteShare - previous.voteShare : null
              const seatDelta = previous ? result.seatsWon - previous.seatsWon : null
              const isPlayer = result.partyId === playerPartyId
              const atMajority = result.seatsWon >= majority
              return (
                <div
                  key={result.partyId}
                  className={`sbd-row${isPlayer ? ' is-player' : ''}${atMajority ? ' at-majority' : ''}`}
                >
                  <span className="sbd-rank">#{rank + 1}</span>
                  <span className="sbd-swatch" style={{ background: result.colour }} />
                  <div className="sbd-info">
                    <strong>{result.partyName}</strong>
                    <small>{result.leader}</small>
                  </div>
                  {/* Mini seat bar */}
                  <div className="sbd-mini-bar-wrap">
                    <div
                      className="sbd-mini-bar"
                      style={{
                        width: `${(result.seatsWon / total) * 100}%`,
                        background: result.colour,
                      }}
                    />
                  </div>
                  <span className="sbd-seats">{result.seatsWon} seats</span>
                  <span className="sbd-share">{result.voteShare.toFixed(1)}%</span>
                  <div className="sbd-trends">
                    {voteDelta !== null && Math.abs(voteDelta) > 0.05 && (
                      <span className={`mini-trend ${voteDelta > 0 ? 'up' : 'down'}`}>
                        {voteDelta > 0 ? '▲' : '▼'} {Math.abs(voteDelta).toFixed(1)}pp
                      </span>
                    )}
                    {seatDelta !== null && seatDelta !== 0 && (
                      <span className={`seat-delta ${seatDelta > 0 ? 'up' : 'down'}`}>
                        {seatDelta > 0 ? '+' : ''}{seatDelta}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Tightest race callout */}
          {world.stats.closestWardMargin < 10 && (
            <div className="sbd-battleground-note">
              Tightest race: <strong>{world.stats.closestWardName}</strong> — {world.stats.closestWardMargin.toFixed(1)}pt margin
            </div>
          )}

          {/* Vote share over time — taller here with more room */}
          {world.voteHistory.length >= 2 && (
            <div className="sbd-history">
              <div className="sbd-history-label">Vote share over time</div>
              <VoteHistoryChart world={world} tall />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Campaign Actions Panel ───────────────────────────────────────────────────
// Always visible, no tabs. Ward picker (battlegrounds first), big action cards.
function CampaignActionsPanel({ world, selectedWardId, onAction }: {
  world: World
  selectedWardId: string
  onAction: (action: CampaignAction) => void
}) {
  const [focusWardId, setFocusWardId] = useState(selectedWardId)
  const [smearTargetId, setSmearTargetId] = useState('')
  const [policyAxis, setPolicyAxis] = useState<'change' | 'growth' | 'services'>('change')
  const [policyDir, setPolicyDir] = useState<1 | -1>(1)
  const [showSmearConfig, setShowSmearConfig] = useState(false)
  const [showPolicyConfig, setShowPolicyConfig] = useState(false)

  useEffect(() => {
    setFocusWardId(selectedWardId)
  }, [selectedWardId])

  const ap = world.playerActionPoints
  const actions = getAvailableActions(world)
  const focusWard = world.constituencies.find((c) => c.id === focusWardId)
  const opponents = world.parties.filter((p) => p.id !== world.playerPartyId)
  const isBattleground = focusWard ? world.stats.battlegroundWardIds.includes(focusWard.id) : false
  const playerIsLeading = focusWard?.leadingPartyId === world.playerPartyId

  function doAction(type: CampaignAction['type'], overrides: Partial<CampaignAction> = {}) {
    const match = actions.find((a) =>
      a.type === type &&
      (type === 'policy_shift' || a.wardId === focusWardId) &&
      (type !== 'smear' || a.targetPartyId === smearTargetId) &&
      (type !== 'policy_shift' || (a.policyAxis === policyAxis && a.policyDirection === policyDir)),
    )
    if (match) onAction({ ...match, ...overrides })
  }

  const hasEvent = world.weeklyEvent && !world.weeklyEvent.resolved

  return (
    <div className="campaign-panel">
      {/* Weekly event — shown at top if active */}
      {hasEvent && (
        <div className="event-card">
          <div className="event-kicker">This week's issue</div>
          <h4 className="event-headline">{world.weeklyEvent!.headline}</h4>
          <p className="event-desc">{world.weeklyEvent!.description}</p>
          <div className="event-choices">
            {world.weeklyEvent!.choices.map((choice, index) => (
              <button
                key={index}
                className={`event-choice-btn${ap < 1 ? ' is-disabled' : ''}`}
                type="button"
                disabled={ap < 1}
                onClick={() => onAction({
                  type: 'respond_event',
                  label: choice.label,
                  description: choice.description,
                  apCost: 1,
                  eventChoiceIndex: index,
                })}
              >
                <strong>{choice.label}</strong>
                <span>{choice.description}</span>
                <span className="ap-cost-badge">1 AP</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected ward poll — driven by map click */}
      {focusWard
        ? (
            <div className={`focus-ward-poll${isBattleground ? ' is-battleground' : ''}`}>
              {/* Header */}
              <div className="fwp-header">
                <div className="fwp-targeting">
                  <span className="fwp-targeting-label">Targeting</span>
                  <strong className="fwp-ward-name">{focusWard.name}</strong>
                  {isBattleground && <span className="battleground-badge">BATTLEGROUND</span>}
                </div>
                <span className="fwp-hint">click map to change</span>
              </div>


              {/* Candidate bars — full poll with names */}
              <div className="fwp-candidate-bars">
                {focusWard.results.map((r, rank) => {
                  const leaderShare = focusWard.results[0]?.voteShare ?? 1
                  const barWidth = (r.voteShare / leaderShare) * 100
                  const isPlayer = r.partyId === world.playerPartyId
                  const isWinner = rank === 0
                  const candidate = focusWard.candidates?.find((c) => c.partyId === r.partyId)
                  // Incumbent = who won this ward at the last actual election
                  const incumbentPartyId = world.electionsHeld >= 1
                    ? world.electionNightResults.find((en) => en.wardId === focusWard.id)?.winner?.partyId
                    : undefined
                  const isIncumbent = incumbentPartyId != null && r.partyId === incumbentPartyId
                  return (
                    <div key={r.partyId} className={`fwp-cand-row${isPlayer ? ' is-player' : ''}${isWinner ? ' is-winner' : ''}`}>
                      <div className="fwp-cand-identity">
                        <span className="fwp-cand-initials" style={{ background: r.colour }}>
                          {candidate?.initials ?? r.partyName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="fwp-cand-names">
                          <div className="fwp-cand-name-row">
                            <span className="fwp-cand-name">{candidate?.name ?? r.partyName}</span>
                            {isIncumbent && <span className="incumbent-badge">INC</span>}
                          </div>
                          <span className="fwp-cand-party">{r.partyName}</span>
                        </div>
                      </div>
                      <div className="fwp-cand-bar-col">
                        <div className="fwp-cand-bar-track">
                          <div
                            className="fwp-cand-bar-fill"
                            style={{ width: `${barWidth}%`, background: r.colour }}
                          />
                        </div>
                        <span className="fwp-cand-pct">{r.voteShare.toFixed(1)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Leading / trailing summary */}
              <div className="fwp-status">
                {playerIsLeading
                  ? <span className="fwp-margin-leading">You're leading by {focusWard.margin.toFixed(1)}pts</span>
                  : <span className="fwp-margin-trailing">You're trailing by {focusWard.margin.toFixed(1)}pts</span>}
              </div>
            </div>
          )
        : <p className="campaign-no-ward">Click a ward on the map to target it.</p>}

      {/* Action cards */}
      <div className="action-cards">
        {/* Canvass */}
        <button
          type="button"
          className={`action-card${ap < 1 ? ' is-disabled' : ''}`}
          disabled={ap < 1}
          onClick={() => doAction('canvass')}
        >
          <div className="ac-header">
            <span className="ac-name">Canvass doors</span>
            <span className={`ac-cost${ap < 1 ? ' cant-afford' : ''}`}>1 AP</span>
          </div>
          <span className="ac-desc">Steady support boost in {focusWard?.name ?? 'ward'}. Safe bet.</span>
        </button>

        {/* Ads */}
        <button
          type="button"
          className={`action-card${ap < 2 ? ' is-disabled' : ''}`}
          disabled={ap < 2}
          onClick={() => doAction('ads')}
        >
          <div className="ac-header">
            <span className="ac-name">Run local ads</span>
            <span className={`ac-cost${ap < 2 ? ' cant-afford' : ''}`}>2 AP</span>
          </div>
          <span className="ac-desc">Bigger boost than canvassing. Good for closing a gap.</span>
        </button>

        {/* Rally */}
        <button
          type="button"
          className={`action-card action-card-rally${ap < 3 ? ' is-disabled' : ''}`}
          disabled={ap < 3}
          onClick={() => doAction('rally')}
        >
          <div className="ac-header">
            <span className="ac-name">Hold a rally</span>
            <span className={`ac-cost${ap < 3 ? ' cant-afford' : ''}`}>3 AP</span>
          </div>
          <span className="ac-desc">High risk, high reward. Could surge — or fall flat.</span>
        </button>

        {/* Smear */}
        <div className={`action-card action-card-smear${ap < 2 ? ' is-disabled' : ''}`}>
          <button
            type="button"
            className="ac-expand-toggle"
            onClick={() => setShowSmearConfig((s) => !s)}
            disabled={ap < 2}
          >
            <div className="ac-header">
              <span className="ac-name">Attack opponent</span>
              <span className={`ac-cost${ap < 2 ? ' cant-afford' : ''}`}>2 AP</span>
            </div>
            <span className="ac-desc">Hurt opponent in this ward. Backfire risk.</span>
          </button>
          {showSmearConfig && ap >= 2 && (
            <div className="ac-config">
              <select
                value={smearTargetId}
                onChange={(e) => setSmearTargetId(e.target.value)}
                className="ac-select"
              >
                <option value="">Pick a target...</option>
                {opponents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                className="ink-button small"
                type="button"
                disabled={!smearTargetId}
                onClick={() => doAction('smear')}
              >
                Launch attack
              </button>
            </div>
          )}
        </div>

        {/* Policy shift */}
        {!world.policyShiftUsedThisCycle
          ? (
              <div className="action-card action-card-policy">
                <button
                  type="button"
                  className="ac-expand-toggle"
                  onClick={() => setShowPolicyConfig((s) => !s)}
                >
                  <div className="ac-header">
                    <span className="ac-name">Shift policy</span>
                    <span className="ac-cost ac-free">Free</span>
                  </div>
                  <span className="ac-desc">Move your party's position. Once per cycle.</span>
                </button>
                {showPolicyConfig && (
                  <div className="ac-config">
                    <select
                      value={policyAxis}
                      onChange={(e) => setPolicyAxis(e.target.value as 'change' | 'growth' | 'services')}
                      className="ac-select"
                    >
                      <option value="change">Reform / Change</option>
                      <option value="growth">Economic Growth</option>
                      <option value="services">Public Services</option>
                    </select>
                    <div className="policy-dir-row">
                      <button type="button" className={`policy-dir-btn${policyDir === 1 ? ' is-active' : ''}`} onClick={() => setPolicyDir(1)}>More</button>
                      <button type="button" className={`policy-dir-btn${policyDir === -1 ? ' is-active' : ''}`} onClick={() => setPolicyDir(-1)}>Less</button>
                    </div>
                    <button
                      className="ink-button small"
                      type="button"
                      onClick={() => doAction('policy_shift')}
                    >
                      Apply shift
                    </button>
                  </div>
                )}
              </div>
            )
          : (
              <div className="action-card is-disabled is-used">
                <div className="ac-header">
                  <span className="ac-name">Policy shift</span>
                  <span className="ac-cost ac-used">Used this cycle</span>
                </div>
              </div>
            )}
      </div>

      {/* This week's actions log */}
      {world.actionsThisWeek.length > 0 && (
        <div className="week-actions-log">
          <div className="log-label">Done this week</div>
          {world.actionsThisWeek.map((a, i) => (
            <div key={i} className={`log-entry log-${a.outcome}`}>
              {a.outcome === 'success' ? '✓' : a.outcome === 'backfire' ? '✗' : '~'} {a.description}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── History chart (simple SVG sparklines) ───────────────────────────────────
function VoteHistoryChart({ world, tall = false }: { world: World; tall?: boolean }) {
  const history = world.voteHistory
  if (history.length < 2) {
    return <div className="history-empty">Advance a few weeks to see vote trends.</div>
  }

  const width = 560
  const height = tall ? 180 : 100
  const padL = 28
  const padR = tall ? 40 : 8
  const padT = 6
  const padB = 16
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  const weeks = history.map((h) => h.week)
  const minWeek = Math.min(...weeks)
  const maxWeek = Math.max(...weeks)

  const topParties = world.nationalResults

  // Find actual max share across all tracked parties + history, then ceiling to nearest 5%
  const allShares = history.flatMap((h) =>
    topParties.map((p) => h.partyShares[p.partyId] ?? 0),
  )
  const rawMax = Math.max(...allShares, 5)
  // Round up to nearest 10
  const yMax = Math.ceil(rawMax / 10) * 10

  // Pick 2–3 sensible gridline values
  const gridlines = yMax <= 30
    ? [Math.round(yMax / 2), yMax]
    : yMax <= 60
      ? [Math.round(yMax / 3), Math.round((yMax * 2) / 3), yMax]
      : [25, 50, yMax]

  function x(week: number) {
    if (maxWeek === minWeek) return padL + chartW / 2
    return padL + ((week - minWeek) / (maxWeek - minWeek)) * chartW
  }

  function y(share: number) {
    return padT + chartH - (share / yMax) * chartH
  }

  return (
    <div className="history-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className={`history-svg${tall ? ' tall' : ''}`}>
        {/* Gridlines + axis labels */}
        {gridlines.map((pct) => (
          <g key={pct}>
            <line x1={padL} x2={padL + chartW} y1={y(pct)} y2={y(pct)} className="chart-gridline" />
            <text x={padL - 4} y={y(pct) + 3} className="chart-axis-label" textAnchor="end">{pct}</text>
          </g>
        ))}
        {/* Zero baseline */}
        <line x1={padL} x2={padL + chartW} y1={y(0)} y2={y(0)} className="chart-gridline" strokeOpacity={0.4} />

        {topParties.map((party) => {
          const points = history
            .map((h) => ({ week: h.week, share: h.partyShares[party.partyId] ?? 0 }))
            .filter((p) => p.share > 0)
          if (points.length < 2) return null
          const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.week).toFixed(1)} ${y(p.share).toFixed(1)}`).join(' ')
          const last = points[points.length - 1]
          const isPlayer = party.partyId === world.playerPartyId
          return (
            <g key={party.partyId}>
              <path d={d} fill="none" stroke={party.colour} strokeWidth={isPlayer ? 2.4 : 1.4} strokeOpacity={isPlayer ? 0.95 : 0.7} />
              <circle cx={x(last.week)} cy={y(last.share)} r={isPlayer ? 3.5 : 2.5} fill={party.colour} />
              {/* Party label at right end */}
              <text
                x={x(last.week) + 5}
                y={y(last.share) + 3}
                className="chart-axis-label"
                style={{ fontSize: 8, fill: party.colour, fontWeight: isPlayer ? 700 : 400 }}
              >
                {last.share.toFixed(0)}%
              </text>
            </g>
          )
        })}
      </svg>

      <div className="chart-legend">
        {topParties.map((p) => (
          <span key={p.partyId} className={`legend-item${p.partyId === world.playerPartyId ? ' is-player' : ''}`}>
            <span className="legend-swatch" style={{ background: p.colour }} />
            {p.partyName}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Setup / Start screen ─────────────────────────────────────────────────────
// Used both as the initial full-screen splash and as a mid-game menu modal.
interface PartyEdit {
  id: string
  name: string
  leader: string
  colour: string
}

function SetupScreen({
  world,
  constituencyCount,
  onSetConstituencyCount,
  onGenerate,
  onStart,
  onSavePartyEdit,
  onClose,
}: {
  world: World | null
  constituencyCount: number
  onSetConstituencyCount: (n: number) => void
  onGenerate: () => void
  onStart: (seed?: number, playerPartyId?: string) => void
  onSavePartyEdit: (edit: PartyEdit) => void
  onClose?: () => void
}) {
  const isFirstTime = world === null
  const [selectedPartyId, setSelectedPartyId] = useState<string>(world?.playerPartyId ?? '')
  const [expandedPartyId, setExpandedPartyId] = useState<string | null>(null)
  // Local edits buffer — initialised from world.parties and kept in sync when world changes
  const [partyEdits, setPartyEdits] = useState<Record<string, PartyEdit>>(() => {
    if (!world) return {}
    return Object.fromEntries(world.parties.map((p) => [p.id, { id: p.id, name: p.name, leader: p.leader, colour: p.colour }]))
  })

  // Re-initialise edits whenever a new world is set (new town or first load)
  // Use the full world object as dependency so mid-campaign menu reopens also sync
  const worldRef = world
  useEffect(() => {
    if (!worldRef) {
      setPartyEdits({})
      setSelectedPartyId('')
      return
    }
    // Merge: keep any locally-typed values but add new party ids from world
    setPartyEdits(Object.fromEntries(
      worldRef.parties.map((p) => [p.id, { id: p.id, name: p.name, leader: p.leader, colour: p.colour }])
    ))
    setSelectedPartyId(worldRef.playerPartyId)
  }, [worldRef?.seed])  // reset on new town seed

  const parties = world?.parties ?? []
  const majorParties = parties.filter((p) => p.tier === 'major' || p.tier === 'custom')
  const minorParties = parties.filter((p) => p.tier === 'minor')

  function editFor(partyId: string): PartyEdit {
    return partyEdits[partyId] ?? { id: partyId, name: '', leader: '', colour: '#888888' }
  }

  function updateEdit(partyId: string, changes: Partial<PartyEdit>) {
    setPartyEdits((prev) => ({ ...prev, [partyId]: { ...prev[partyId], ...changes } }))
  }

  // Save a single party edit immediately to world (called on blur or colour change)
  function saveEdit(partyId: string) {
    const edit = partyEdits[partyId]
    if (edit) onSavePartyEdit(edit)
  }

  function handleStart() {
    // Flush any pending edits for all parties before starting
    Object.values(partyEdits).forEach((edit) => onSavePartyEdit(edit))
    onStart(world?.seed, selectedPartyId || world?.playerPartyId)
  }

  function handleNewTown() {
    // Generate a new town and stay on the setup screen so the player can pick a party
    onGenerate()
  }

  const wardCounts = [5, 6, 7, 8, 9, 10, 11, 12]

  return (
    <div className={`setup-screen${isFirstTime ? ' is-splash' : ' is-modal'}`}>
      {/* Background texture */}
      <div className="setup-bg" />

      <div className="setup-inner">
        {/* Header */}
        <div className="setup-masthead">
          <div className="setup-rule" />
          <h1 className="setup-title">Electland</h1>
          <p className="setup-tagline">A tiny English town. A local election. Can you take the council?</p>
          <div className="setup-rule" />
        </div>

        <div className="setup-body">
          {/* Left: configuration */}
          <div className="setup-config">
            {/* Ward count */}
            <div className="setup-section">
              <div className="setup-section-label">Number of wards</div>
              <div className="ward-count-buttons">
                {wardCounts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ward-count-btn${constituencyCount === n ? ' is-active' : ''}`}
                    onClick={() => onSetConstituencyCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="setup-hint">
                {constituencyCount <= 6 ? 'Intimate — every vote is visible.' : constituencyCount <= 9 ? 'Classic — tight but strategic.' : 'Large — harder to manage, more drama.'}
              </p>
            </div>

            {/* Town info */}
            {world && (
              <div className="setup-section">
                <div className="setup-section-label">Current town</div>
                <div className="setup-town-card">
                  <strong>{world.townName}</strong>
                  <span>{world.constituencies.length} wards · pop. {world.totalPopulation.toLocaleString('en-GB')} · week {world.week}</span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="setup-actions">
              <button className="setup-btn-secondary" type="button" onClick={handleNewTown}>
                {world ? 'New Town' : 'Generate Town'}
              </button>
              {world && (
                <button className="setup-btn-primary" type="button" onClick={handleStart}>
                  Start Race
                </button>
              )}
              {!isFirstTime && onClose && (
                <button className="setup-btn-ghost" type="button" onClick={onClose}>
                  Cancel — back to game
                </button>
              )}
            </div>
          </div>

          {/* Right: party selection */}
          <div className="setup-parties">
            <div className="setup-section-label">
              {parties.length === 0 ? 'Generate a town to see the parties' : 'Choose your party — click to select, expand to edit'}
            </div>

            {parties.length > 0 && (
              <>
                {/* Major parties */}
                <div className="setup-party-group">
                  {majorParties.map((party) => {
                    const edit = editFor(party.id)
                    const isSelected = selectedPartyId === party.id || (!selectedPartyId && party.id === world?.playerPartyId)
                    const isExpanded = expandedPartyId === party.id
                    return (
                      <div
                        key={party.id}
                        className={`setup-party-card${isSelected ? ' is-selected' : ''}${isExpanded ? ' is-expanded' : ''}`}
                      >
                        {/* Card header — click to select */}
                        <button
                          type="button"
                          className="setup-party-header"
                          onClick={() => {
                            setSelectedPartyId(party.id)
                            setExpandedPartyId(isExpanded ? null : party.id)
                          }}
                        >
                           <span className="setup-party-swatch" style={{ background: edit.colour }} />
                          <div className="setup-party-info">
                            <span className="setup-party-name">{edit.name}</span>
                            <span className="setup-party-leader">{edit.leader}</span>
                            <span className="setup-party-ideology">{ideologySummary(party.values)}</span>
                          </div>
                          <div className="setup-party-meta">
                            <span className="setup-party-tier">Major</span>
                            {isSelected && <span className="setup-party-playing">YOU</span>}
                          </div>
                          <span className="setup-party-expand">{isExpanded ? '▲' : '▼'}</span>
                        </button>

                        {/* Ideology widget — always visible below header */}
                        <div className="setup-party-ideology-bar">
                          <IdeologyWidget values={party.values} colour={edit.colour} compact />
                        </div>

                        {/* Inline edit panel */}
                        {isExpanded && (
                          <div className="setup-party-edit">
                            <label className="setup-edit-field">
                              <span>Party name</span>
                              <input
                                value={edit.name}
                                onChange={(e) => updateEdit(party.id, { name: e.target.value })}
                                onBlur={() => saveEdit(party.id)}
                                placeholder={party.name}
                              />
                            </label>
                            <label className="setup-edit-field">
                              <span>Leader</span>
                              <input
                                value={edit.leader}
                                onChange={(e) => updateEdit(party.id, { leader: e.target.value })}
                                onBlur={() => saveEdit(party.id)}
                                placeholder={party.leader}
                              />
                            </label>
                            <label className="setup-edit-field setup-edit-colour">
                              <span>Colour</span>
                              <input
                                type="color"
                                value={edit.colour}
                                onChange={(e) => {
                                  updateEdit(party.id, { colour: e.target.value })
                                  onSavePartyEdit({ ...edit, colour: e.target.value })
                                }}
                              />
                              <span className="colour-preview" style={{ background: edit.colour }} />
                            </label>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Minor parties — shown flat, not in a dropdown */}
                {minorParties.length > 0 && (
                  <div className="setup-minor-group">
                    <div className="setup-minor-label">Minor parties</div>
                    <div className="setup-party-group minor">
                      {minorParties.map((party) => {
                        const edit = editFor(party.id)
                        const isSelected = selectedPartyId === party.id
                        const isExpanded = expandedPartyId === party.id
                        return (
                          <div
                            key={party.id}
                            className={`setup-party-card is-minor${isSelected ? ' is-selected' : ''}${isExpanded ? ' is-expanded' : ''}`}
                          >
                            <button
                              type="button"
                              className="setup-party-header"
                              onClick={() => {
                                setSelectedPartyId(party.id)
                                setExpandedPartyId(isExpanded ? null : party.id)
                              }}
                            >
                              <span className="setup-party-swatch" style={{ background: edit.colour }} />
                              <div className="setup-party-info">
                                <span className="setup-party-name">{edit.name}</span>
                                <span className="setup-party-leader">{edit.leader}</span>
                                <span className="setup-party-ideology">{ideologySummary(party.values)}</span>
                              </div>
                              <div className="setup-party-meta">
                                <span className="setup-party-tier">Minor</span>
                                {isSelected && <span className="setup-party-playing">YOU</span>}
                              </div>
                              <span className="setup-party-expand">{isExpanded ? '▲' : '▼'}</span>
                            </button>
                            {/* Ideology widget — always visible */}
                            <div className="setup-party-ideology-bar">
                              <IdeologyWidget values={party.values} colour={edit.colour} compact />
                            </div>
                            {isExpanded && (
                              <div className="setup-party-edit">
                                <label className="setup-edit-field">
                                  <span>Party name</span>
                                  <input
                                    value={edit.name}
                                    onChange={(e) => updateEdit(party.id, { name: e.target.value })}
                                    onBlur={() => saveEdit(party.id)}
                                  />
                                </label>
                                <label className="setup-edit-field">
                                  <span>Leader</span>
                                  <input
                                    value={edit.leader}
                                    onChange={(e) => updateEdit(party.id, { leader: e.target.value })}
                                    onBlur={() => saveEdit(party.id)}
                                  />
                                </label>
                                <label className="setup-edit-field setup-edit-colour">
                                  <span>Colour</span>
                                  <input
                                    type="color"
                                    value={edit.colour}
                                    onChange={(e) => {
                                      updateEdit(party.id, { colour: e.target.value })
                                      onSavePartyEdit({ ...edit, colour: e.target.value })
                                    }}
                                  />
                                  <span className="colour-preview" style={{ background: edit.colour }} />
                                </label>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
function App() {
  const [constituencyCount, setConstituencyCount] = useState(8)
  const [world, setWorld] = useState<World | null>(null)
  const [previousWorld, setPreviousWorld] = useState<World | null>(null)
  const [selectedConstituencyId, setSelectedConstituencyId] = useState('')
  const [selectedBlocId, setSelectedBlocId] = useState('')
  const [selectedTileId, setSelectedTileId] = useState('')
  const [mapMode, setMapMode] = useState<MapMode>('ward')
  const [menuOpen, setMenuOpen] = useState(true)
  const [lastActionResult, setLastActionResult] = useState<ActionResult | null>(null)
  const [showElectionNight, setShowElectionNight] = useState(false)
  const [showGovernance, setShowGovernance] = useState(false)

  // ── Derived ──────────────────────────────────────────────────────────────────
  const selectedConstituency = useMemo(
    () => world?.constituencies.find((seat) => seat.id === selectedConstituencyId),
    [world, selectedConstituencyId],
  )

  const blocColours = useMemo(
    () => Object.fromEntries((world?.blocs ?? []).map((bloc, index) => [bloc.id, blocPalette[index % blocPalette.length]])),
    [world],
  )

  const selectedTile = useMemo(
    () => world?.tiles.find((tile) => tile.id === selectedTileId),
    [selectedTileId, world],
  )

  const constituencyTiles = useMemo(
    () => world?.tiles.filter((tile) => tile.constituencyId === selectedConstituencyId).sort((a, b) => b.population - a.population) ?? [],
    [selectedConstituencyId, world],
  )

  const tilePreferenceById = useMemo(() => {
    if (!world) return new Map()
    return new Map(world.tiles.map((tile) => [tile.id, estimateTilePreference(world, tile)]))
  }, [world])

  const selectedTileEstimate = selectedTile ? tilePreferenceById.get(selectedTile.id) ?? null : null

  const previousNationalById = useMemo(
    () => new Map((previousWorld?.nationalResults ?? []).map((result) => [result.partyId, result])),
    [previousWorld],
  )

  const playerParty = world?.parties.find((party) => party.id === world.playerPartyId)
  const playerResult = world?.nationalResults.find((r) => r.partyId === world.playerPartyId)

  // ── Selection cleanup effects ────────────────────────────────────────────────
  useEffect(() => {
    if (!world) {
      setSelectedBlocId('')
      setSelectedTileId('')
      return
    }
    if (!selectedConstituencyId || !world.constituencies.some((seat) => seat.id === selectedConstituencyId)) {
      setSelectedConstituencyId(world.constituencies[0]?.id ?? '')
    }
  }, [selectedConstituencyId, world])

  useEffect(() => {
    if (!selectedConstituency) return
    const defaultBlocId = dominantBlocId(selectedConstituency.blocMix)
    if (!selectedBlocId || !world?.blocs.some((bloc) => bloc.id === selectedBlocId)) {
      setSelectedBlocId(defaultBlocId)
    }
    if (!selectedTileId || !constituencyTiles.some((tile) => tile.id === selectedTileId)) {
      setSelectedTileId(constituencyTiles[0]?.id ?? '')
    }
  }, [constituencyTiles, selectedBlocId, selectedConstituency, selectedTileId, world])

  // Show election night when it activates — only trigger once per election
  useEffect(() => {
    if (world?.electionNightActive && !showElectionNight) {
      setShowElectionNight(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world?.electionNightActive])

  // Show governance when it activates
  useEffect(() => {
    if (world?.isGoverning && world.governanceDecisions.some((d) => !d.resolved)) {
      setShowGovernance(true)
    }
  }, [world?.isGoverning, world?.governanceDecisions])

  // ── World builders ────────────────────────────────────────────────────────────
  // Called on blur/colour-change from SetupScreen — immediately writes a single party's
  // name/leader/colour into world so edits persist without pressing "Start Race"
  const handleSavePartyEdit = useCallback((edit: PartyEdit) => {
    if (!world) return
    const patchParty = (p: PartyDefinition) =>
      p.id !== edit.id ? p : { ...p, name: edit.name || p.name, leader: edit.leader || p.leader, colour: edit.colour }
    setWorld({
      ...world,
      parties: world.parties.map(patchParty),
      constituencies: world.constituencies.map((c) => ({
        ...c,
        candidates: c.candidates.map((cand) =>
          cand.partyId !== edit.id ? cand : { ...cand, partyName: edit.name || cand.partyName, partyColour: edit.colour },
        ),
      })),
    })
  }, [world])

  // Called by SetupScreen Start Race button — updates player party selection and closes menu
  const handleSetupStart = useCallback((seed?: number, playerPartyId?: string) => {
    // If a new seed is provided, regenerate entirely
    if (seed !== undefined && seed !== world?.seed) {
      const nextWorld = generateWorld({ seed, constituencyCount, customParties: [], playerPartyId })
      setPreviousWorld(null)
      setWorld(nextWorld)
      setShowElectionNight(false)
      setShowGovernance(false)
      setLastActionResult(null)
      setSelectedConstituencyId(nextWorld.constituencies[0]?.id ?? '')
      setSelectedBlocId(dominantBlocId(nextWorld.constituencies[0]?.blocMix ?? {}))
      setSelectedTileId(nextWorld.tiles.find((t) => t.constituencyId === nextWorld.constituencies[0]?.id)?.id ?? '')
    } else if (world) {
      // Just update player selection — party edits already applied via handleSavePartyEdit
      if (playerPartyId && playerPartyId !== world.playerPartyId) {
        setWorld({ ...world, playerPartyId })
      }
    }
    setMenuOpen(false)
  }, [world, constituencyCount])

  const advanceWeek = () => {
    if (!world) return
    setPreviousWorld(world)
    setWorld(simulateWeek(world))
  }

  const handleAction = (action: CampaignAction) => {
    if (!world) return
    const { world: nextWorld, result } = applyCampaignAction(world, action)
    setWorld(nextWorld)
    setLastActionResult(result)
  }

  const handleGovernanceDecision = (decisionId: string, choiceIndex: number) => {
    if (!world) return
    const nextDecisions = world.governanceDecisions.map((d) =>
      d.id === decisionId ? { ...d, resolved: true, chosenIndex: choiceIndex } : d,
    )
    const decision = world.governanceDecisions.find((d) => d.id === decisionId)
    const choice = decision?.choices[choiceIndex]
    let updatedParties = world.parties.map((p) => {
      if (p.id !== world.playerPartyId || !choice) return p
      return {
        ...p,
        baseUtility: Math.min(1.2, p.baseUtility + choice.effect.playerUtilityDelta),
      }
    })
    const newsFeedLine = `Week ${world.week}: Council decision — ${decision?.headline ?? 'decision made'} — you chose "${choice?.label ?? '?'}".`
    setWorld({
      ...world,
      parties: updatedParties,
      governanceDecisions: nextDecisions,
      newsFeed: [newsFeedLine, ...world.newsFeed].slice(0, 30),
    })
    const stillPending = nextDecisions.filter((d) => !d.resolved)
    if (stillPending.length === 0) setShowGovernance(false)
  }

  const focusTile = (tileId: string) => {
    if (!world) return
    const tile = world.tiles.find((entry) => entry.id === tileId)
    if (!tile) return
    setSelectedTileId(tile.id)
    setSelectedBlocId(dominantBlocId(tile.blocMix))
    if (tile.constituencyId) setSelectedConstituencyId(tile.constituencyId)
  }

  const electionIn = world?.weeksUntilElection ?? 0
  const majority = world?.stats.councilMajority ?? 0
  const playerSeats = playerResult?.seatsWon ?? 0
  const seatsNeeded = majority - playerSeats
  const isBattleground = world ? world.stats.battlegroundWardIds.length > 0 : false

  return (
    <div className="newspaper-shell">
      {/* Masthead */}
      {!menuOpen && (
      <header className="masthead">
        <div className="masthead-rule" />
        <div className="masthead-inner">
          <h1>Electland Gazette</h1>
          {world && (
            <div className="masthead-meta">
              <span>{world.townName} Council</span>
              <span>Week {world.week}</span>
              <span className={`election-countdown${electionIn <= 4 ? ' urgent' : ''}`}>
                {electionIn === 0 ? 'Election today!' : `Election in ${electionIn} week${electionIn !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}
        </div>
        <div className="masthead-rule" />
      </header>
      )}

      <main className="front-page">
        {/* Setup screen — full-screen splash on first visit, modal overlay mid-game */}
        {menuOpen && (
          <SetupScreen
            world={world}
            constituencyCount={constituencyCount}
            onSetConstituencyCount={setConstituencyCount}
            onGenerate={() => {
              // Generate a new world and stay on the setup screen — let player pick a party first
              const nextWorld = generateWorld({ seed: Date.now(), constituencyCount, customParties: [], playerPartyId: undefined })
              setPreviousWorld(null)
              setWorld(nextWorld)
              setShowElectionNight(false)
              setShowGovernance(false)
              setLastActionResult(null)
              setSelectedConstituencyId(nextWorld.constituencies[0]?.id ?? '')
              setSelectedBlocId(dominantBlocId(nextWorld.constituencies[0]?.blocMix ?? {}))
              setSelectedTileId(nextWorld.tiles.find((t) => t.constituencyId === nextWorld.constituencies[0]?.id)?.id ?? '')
              // menuOpen stays true — user must press Start Race to begin
            }}
            onStart={handleSetupStart}
            onSavePartyEdit={handleSavePartyEdit}
            onClose={world ? () => setMenuOpen(false) : undefined}
          />
        )}

        {/* Top bar */}
        {world && !menuOpen && (
          <div className="game-topbar">
            {/* Player party status */}
            <div className="topbar-party-block" style={{ borderLeftColor: playerParty?.colour ?? '#888' }}>
              {playerParty && (
                <>
                  <div className="party-initials-badge" style={{ background: playerParty.colour }}>
                    {playerParty.leader.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <strong>{playerParty.name}</strong>
                    <small>{playerParty.leader} · {playerSeats} seat{playerSeats !== 1 ? 's' : ''}{seatsNeeded > 0 ? ` · need ${seatsNeeded} more` : ' · MAJORITY!'}</small>
                  </div>
                </>
              )}
            </div>

            {/* AP bar */}
            <div className="topbar-ap-block">
              <span className="ap-label-small">AP</span>
              <div className="ap-pips-small">
                {Array.from({ length: world.maxActionPoints }).map((_, i) => (
                  <span key={i} className={`ap-pip-small${i < world.playerActionPoints ? ' filled' : ''}`} />
                ))}
              </div>
              <span className="ap-count-small">{world.playerActionPoints}/{world.maxActionPoints}</span>
            </div>

            {/* Election countdown */}
            <div className={`topbar-countdown${electionIn <= 4 ? ' urgent' : ''}`}>
              <span className="countdown-number">{electionIn}</span>
              <span className="countdown-label">week{electionIn !== 1 ? 's' : ''} to election</span>
            </div>

            {/* Battleground alert */}
            {isBattleground && (
              <div className="battleground-alert">
                {world.stats.battlegroundWardIds.length} battleground ward{world.stats.battlegroundWardIds.length !== 1 ? 's' : ''}
              </div>
            )}

            <div className="topbar-actions">
              <button className="ink-button secondary small" type="button" onClick={() => setMenuOpen(true)}>Menu</button>
              <button className="ink-button small" type="button" onClick={advanceWeek}>
                Advance Week →
              </button>
            </div>
          </div>
        )}

        {/* Main layout */}
        <div className="dashboard-layout">
          {world ? (
            <>
              {/* Seat bar — horizontal standings above the map */}
              <div className="seat-bar-row">
                <SeatBar world={world} previousNationalById={previousNationalById} />
              </div>

              {/* Map panel */}
              <section className="panel map-panel">
                <div className="map-panel-header">
                  <div>
                    <div className="panel-kicker">Campaign Map</div>
                    <h3>{world.townName}</h3>
                  </div>
                  <div className="map-mode-row">
                    {(['ward', 'bloc', 'voter'] as MapMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`mode-btn${mode === mapMode ? ' is-active' : ''}`}
                        onClick={() => setMapMode(mode)}
                      >
                        {mode === 'ward' ? 'Wards' : mode === 'bloc' ? 'Blocs' : 'Clusters'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Issues strip */}
                <div className="currents-strip">
                  {world.currents.map((current, i) => (
                    <span key={`${current.id}-${i}`} className="current-pill">
                      <span className="current-dot" />
                      {current.label}
                    </span>
                  ))}
                </div>

                <MapFigure
                  world={world}
                  mapMode={mapMode}
                  selectedConstituencyId={selectedConstituencyId}
                  selectedBlocId={selectedBlocId}
                  selectedTileId={selectedTileId}
                  blocColours={blocColours}
                  tilePreferenceById={tilePreferenceById}
                  onSelectConstituency={setSelectedConstituencyId}
                  onSelectBloc={setSelectedBlocId}
                  onSelectTile={focusTile}
                />
              </section>

              {/* Right column — no tabs, campaign always-on, ward detail always-on below */}
              <div className="right-column">
                <section className="panel campaign-panel-wrap">
                  <div className="panel-kicker">Campaign</div>
                  <CampaignActionsPanel
                    world={world}
                    selectedWardId={selectedConstituencyId}
                    onAction={handleAction}
                  />
                </section>

                <ConstituencyInspector
                  world={world}
                  constituency={selectedConstituency}
                  mapMode={mapMode}
                  selectedBlocId={selectedBlocId}
                  selectedTile={selectedTile as PopulationTile | undefined}
                  selectedTileEstimate={selectedTileEstimate}
                />
              </div>
            </>
          ) : (
            <section className="panel empty-panel">
              <h2>The presses await.</h2>
              <p>Open the menu, set your ward count, and start a fresh race.</p>
            </section>
          )}
        </div>
      </main>

      {/* Action flash */}
      {lastActionResult && (
        <ActionFlash result={lastActionResult} onDismiss={() => setLastActionResult(null)} />
      )}

      {/* Election night modal */}
      {showElectionNight && world && (
        <ElectionNightModal
          world={world}
          onReveal={() => setWorld((w) => w ? { ...w, electionNightRevealIndex: Math.min(w.electionNightRevealIndex + 1, w.electionNightResults.length) } : w)}
          onClose={() => {
            setShowElectionNight(false)
            // Clear electionNightActive on the world so the useEffect doesn't re-open immediately
            setWorld((w) => {
              if (!w) return w
              const nextWorld = { ...w, electionNightActive: false, playerLost: false }
              if (w.isGoverning && w.governanceDecisions.some((d) => !d.resolved)) {
                setShowGovernance(true)
              }
              return nextWorld
            })
          }}
        />
      )}

      {/* Governance modal */}
      {showGovernance && world && (
        <GovernanceModal
          world={world}
          decisions={world.governanceDecisions}
          onDecide={handleGovernanceDecision}
          onClose={() => setShowGovernance(false)}
        />
      )}
    </div>
  )
}

export default App
