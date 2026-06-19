import { useState } from 'react'
import { generateGovernanceDecisions, coalitionCompatibility } from '../lib/sim'
import type { GovernanceDecision, World } from '../types/sim'

interface CoalitionOption {
  label: string
  description: string
  partnerId: string | null
  partnerColor: string
  combinedSeats: number
  compatibility: number
  accepted: boolean
  repPenalty: number
  isMinority?: boolean
}

export function CoalitionModal({ world, onFormCoalition, onFormMinority, onOpposition }: {
  world: World
  onFormCoalition: (partnerId: string, decisions: GovernanceDecision[]) => void
  onFormMinority: (decisions: GovernanceDecision[]) => void
  onOpposition: () => void
}) {
  const majority = world.stats.councilMajority
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const playerSeats = world.nationalResults.find((r) => r.partyId === world.playerPartyId)?.seatsWon ?? 0
  const largestResult = [...world.nationalResults].sort((a, b) => b.seatsWon - a.seatsWon)[0]
  const largestParty = world.parties.find((p) => p.id === largestResult.partyId)
  const playerIsLargest = largestResult.partyId === world.playerPartyId

  const options: CoalitionOption[] = []

  for (const other of world.parties.filter((p) => p.id !== world.playerPartyId)) {
    const theirSeats = world.nationalResults.find((r) => r.partyId === other.id)?.seatsWon ?? 0
    const combined = playerSeats + theirSeats
    const repKey = [world.playerPartyId, other.id].sort().join('_')
    const repPenalty = (world.allianceReputation[repKey] ?? 0) * 15
    const compat = Math.max(0, coalitionCompatibility(playerParty?.values ?? { change: 0, growth: 0, services: 0 }, other.values) - repPenalty)
    const accepted = combined >= majority && compat >= 50

    options.push({
      label: `with ${other.name}`,
      description: `You (${playerSeats}) + ${other.name} (${theirSeats}) = ${combined} seats`,
      partnerId: other.id,
      partnerColor: other.colour,
      combinedSeats: combined,
      compatibility: Math.round(compat),
      accepted,
      repPenalty: Math.round(repPenalty),
    })
  }

  options.sort((a, b) => {
    const aCan = a.combinedSeats >= majority
    const bCan = b.combinedSeats >= majority
    if (aCan !== bCan) return aCan ? -1 : 1
    return b.compatibility - a.compatibility
  })

  if (playerIsLargest) {
    options.push({
      label: 'Minority government',
      description: `Govern alone with ${playerSeats} seats (${majority} needed). Riskier, but no compromises.`,
      partnerId: null,
      partnerColor: playerParty?.colour ?? '#888',
      combinedSeats: playerSeats,
      compatibility: 0,
      accepted: true,
      repPenalty: 0,
      isMinority: true,
    })
  }

  const nonPlayerOptions: Array<{ name: string; combined: number; compat: number }> = []
  if (!playerIsLargest && largestParty) {
    for (const r of world.nationalResults.filter((r) => r.partyId !== world.playerPartyId && r.partyId !== largestParty.id)) {
      const other = world.parties.find((p) => p.id === r.partyId)
      if (!other) continue
      nonPlayerOptions.push({
        name: `${largestParty.name} + ${other.name}`,
        combined: largestResult.seatsWon + r.seatsWon,
        compat: coalitionCompatibility(largestParty.values, other.values),
      })
    }
    nonPlayerOptions.sort((a, b) => b.compat - a.compat)
  }
  const bestNonPlayer = nonPlayerOptions[0]
  const fateText = playerIsLargest
    ? `As the largest party, you lead negotiations.`
    : bestNonPlayer
      ? `If you don't form a government, ${bestNonPlayer.name} would have ${bestNonPlayer.combined} seats (${bestNonPlayer.compat}% match).`
      : `If you don't form a government, ${largestParty?.name ?? 'the largest party'} would likely govern as a minority.`

  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [attemptResult, setAttemptResult] = useState<{ accepted: boolean; message: string } | null>(null)

  function tryForm(option: CoalitionOption) {
    if (option.isMinority) {
      onFormMinority(generateGovernanceDecisions(1))
      return
    }
    if (!option.partnerId) return

    if (option.accepted) {
      onFormCoalition(option.partnerId, generateGovernanceDecisions(2))
    } else {
      setAttemptId(option.partnerId)
      const cannotMajority = option.combinedSeats < majority
      const message = cannotMajority
        ? `${option.label.replace('with ', '')} — only ${option.combinedSeats} seats combined (need ${majority}). Not enough for a majority.`
        : `${option.label.replace('with ', '')} — compatibility too low (${option.compatibility}%, need ≥50%). They decline.`
      setAttemptResult({ accepted: false, message })
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal coalition-modal">
        <div className="modal-header">
          <span className="modal-kicker">Government Formation</span>
          <h2>No Overall Control</h2>
          <p className="modal-sub">{majority} seats needed for a majority.</p>
        </div>

        <div className="coalition-list">
          {options.map((opt, i) => {
            const isAttempted = attemptId === opt.partnerId
            const canMajority = opt.combinedSeats >= majority
            return (
              <div
                key={i}
                className={`coalition-row${canMajority ? ' can-majority' : ''}${opt.isMinority ? ' is-minority' : ''}${isAttempted && attemptResult && !attemptResult.accepted ? ' is-rejected' : ''}`}
              >
                <div className="coalition-row-top">
                  <span className="coalition-swatch" style={{ background: opt.partnerColor }} />
                  <div className="coalition-row-info">
                    <span className="coalition-row-label">{opt.label}</span>
                    <span className="coalition-row-desc">{opt.description}</span>
                  </div>
                  {!opt.isMinority && (
                    <span className="coalition-row-compat">
                      {opt.compatibility}% match
                      {opt.repPenalty > 0 && (
                        <span className="coalition-rep-note" title="Penalty from broken pacts">
                          {' '}(−{opt.repPenalty}%)
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {isAttempted && attemptResult && (
                  <div className="coalition-result is-rejected">
                    {attemptResult.message}
                  </div>
                )}
                {canMajority || opt.isMinority ? (
                  <button className="coalition-row-btn" type="button" onClick={() => tryForm(opt)}>
                    {opt.isMinority ? 'Form minority' : 'Form government'}
                  </button>
                ) : (
                  <span className="coalition-row-label" style={{ fontSize: '0.66rem', color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                    Not enough seats ({opt.combinedSeats} of {majority})
                  </span>
                )}
              </div>
            )
          })}

          <div className="coalition-fate">
            <p>{fateText}</p>
            <button className="coalition-row-btn" type="button" onClick={onOpposition}>
              Go into opposition
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
