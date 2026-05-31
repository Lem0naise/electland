import { useState } from 'react'
import { coalitionCompatibility, generateGovernanceDecisions } from '../lib/sim'
import type { World } from '../types/sim'

interface CoalitionModalProps {
  world: World
  onFormCoalition: (partnerId: string, decisions: ReturnType<typeof generateGovernanceDecisions>) => void
  onFormMinority: (decisions: ReturnType<typeof generateGovernanceDecisions>) => void
  onOpposition: () => void
}

interface PartyOption {
  partyId: string
  name: string
  leader: string
  colour: string
  seats: number
  compatibility: number
  combinedSeats: number
  canMajority: boolean
  rejected: boolean
}

export function CoalitionModal({ world, onFormCoalition, onFormMinority, onOpposition }: CoalitionModalProps) {
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set())
  const [invitationResponse, setInvitationResponse] = useState<'pending' | 'accepted' | 'rejected'>('pending')

  const majority = world.stats.councilMajority
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const playerResult = world.nationalResults.find((r) => r.partyId === world.playerPartyId)
  const playerSeats = playerResult?.seatsWon ?? 0

  // Find the largest party
  const ranked = [...world.nationalResults].sort((a, b) => b.seatsWon - a.seatsWon)
  const largestParty = world.parties.find((p) => p.id === ranked[0]?.partyId)
  const playerIsLargest = largestParty?.id === world.playerPartyId

  // Build coalition options (exclude parties not in parliament and the player)
  const options: PartyOption[] = world.parties
    .filter((p) => p.id !== world.playerPartyId)
    .map((p) => {
      const seats = world.nationalResults.find((r) => r.partyId === p.id)?.seatsWon ?? 0
      const compat = playerParty ? coalitionCompatibility(playerParty.values, p.values) : 50
      const repKey = [world.playerPartyId, p.id].sort().join('_')
      const repPenalty = (world.allianceReputation[repKey] ?? 0) * 15
      return {
        partyId: p.id,
        name: p.name,
        leader: p.leader,
        colour: p.colour,
        seats,
        compatibility: Math.max(0, Math.round(compat - repPenalty)),
        combinedSeats: playerSeats + seats,
        canMajority: playerSeats + seats >= majority,
        rejected: false,
      }
    })
    .sort((a, b) => b.compatibility - a.compatibility)

  // Case: player is NOT the largest party — largest party forms government
  if (!playerIsLargest && largestParty && ranked[0]) {
    const largestSeats = ranked[0]?.seatsWon ?? 0
    const largestCompatibility = playerParty ? coalitionCompatibility(largestParty!.values, playerParty.values) : 50
    const combinedWithPlayer = largestSeats + playerSeats
    const playerCanHelp = combinedWithPlayer >= majority

    // Largest party's best partner (sorted by compatibility * seat contribution)
    const largestOptions = world.parties
      .filter((p) => p.id !== largestParty.id && p.id !== world.playerPartyId)
      .map((p) => {
        const seats = world.nationalResults.find((r) => r.partyId === p.id)?.seatsWon ?? 0
        const compat = coalitionCompatibility(largestParty.values, p.values)
        return { partyId: p.id, name: p.name, seats, compatibility: compat, combined: largestSeats + seats }
      })
      .filter((o) => o.combined >= majority)
      .sort((a, b) => b.compatibility - a.compatibility)

    const bestNonPlayer = largestOptions[0]

    function acceptInvitation() {
      setInvitationResponse('accepted')
      const decisions = generateGovernanceDecisions(2)
      onFormCoalition(largestParty!.id, decisions)
    }

    function rejectInvitation() {
      setInvitationResponse('rejected')
      // If there's another viable partner for the largest party
      if (bestNonPlayer) {
        // Give user a moment to see, then proceed
        setTimeout(() => {
          onOpposition()
        }, 0)
      }
    }

    return (
      <div className="modal-backdrop">
        <div className="modal coalition-modal">
          <div className="modal-header">
            <span className="modal-kicker">Government Formation</span>
            <h2>{world.townName} Council</h2>
            <p className="modal-sub">
              {largestParty.name} is the largest party with {largestSeats} seat{largestSeats !== 1 ? 's' : ''} — {majority} needed for a majority
            </p>
          </div>

          {invitationResponse === 'pending' && playerCanHelp && (
            <div className="coalition-invitation">
              <div className="coalition-invite-header">
                <span className="coalition-swatch" style={{ background: largestParty.colour }} />
                <strong>{largestParty.name}</strong>
                <span>invites {playerParty?.name ?? 'you'} to form a coalition</span>
              </div>
              <div className="coalition-invite-seats">
                {largestSeats} + {playerSeats} = <strong>{combinedWithPlayer}</strong> seats — majority of {majority}
              </div>
              <div className="coalition-invite-compat">
                Ideology match: <strong style={{ color: largestCompatibility >= 60 ? '#1a5c2a' : largestCompatibility >= 40 ? '#b8860b' : '#9b1c1c' }}>{largestCompatibility}%</strong>
              </div>
              <div className="coalition-invite-actions">
                <button className="ink-button" type="button" onClick={acceptInvitation}>
                  {'\u2713'} Accept — form government
                </button>
                <button className="ink-button secondary" type="button" onClick={rejectInvitation}>
                  {'\u2717'} Reject — {bestNonPlayer ? `${largestParty.name} will govern with ${bestNonPlayer.name}` : 'go into opposition'}
                </button>
              </div>
            </div>
          )}

          {invitationResponse === 'rejected' && (
            <div className="coalition-outcome">
              <p>You rejected the invitation. {largestParty.name} {bestNonPlayer ? `forms a government with ${bestNonPlayer.name} (${largestSeats}+${bestNonPlayer.seats}=${bestNonPlayer.combined} seats).` : 'governs as a minority.'}</p>
              <p>Your party is now in opposition.</p>
              <button className="ink-button" type="button" onClick={onOpposition}>
                Continue
              </button>
            </div>
          )}

          {!playerCanHelp && (
            <div className="coalition-outcome">
              <p>{playerParty?.name ?? 'Your party'} has {playerSeats} seat{playerSeats !== 1 ? 's' : ''} — not enough to help {largestParty.name} reach a majority.</p>
              <p>{largestParty.name} {bestNonPlayer ? `forms a government with ${bestNonPlayer.name}.` : 'governs as a minority.'}</p>
              <button className="ink-button" type="button" onClick={onOpposition}>
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Case: player IS the largest party — player proposes to others
  const anyTryable = options.some((o) => !rejectedIds.has(o.partyId))

  function propose(p: PartyOption) {
    if (rejectedIds.has(p.partyId)) return
    const compat = playerParty ? coalitionCompatibility(playerParty.values, world.parties.find((x) => x.id === p.partyId)?.values ?? playerParty.values) : 50
    if (compat >= 60) {
      const decisions = generateGovernanceDecisions(2)
      onFormCoalition(p.partyId, decisions)
    } else if (compat >= 40) {
      if (Math.random() < 0.6) {
        const decisions = generateGovernanceDecisions(2)
        onFormCoalition(p.partyId, decisions)
      } else {
        setRejectedIds((prev) => new Set(prev).add(p.partyId))
      }
    } else {
      setRejectedIds((prev) => new Set(prev).add(p.partyId))
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal coalition-modal">
        <div className="modal-header">
          <span className="modal-kicker">Government Formation</span>
          <h2>{world.townName} Council</h2>
          <p className="modal-sub">
            {playerParty?.name ?? 'Your party'} is the largest party with {playerSeats} seat{playerSeats !== 1 ? 's' : ''} — {majority} needed for a majority
          </p>
        </div>

        <div className="coalition-parties">
          {options.map((p) => {
            const isRejected = rejectedIds.has(p.partyId)
            return (
              <div
                key={p.partyId}
                className={`coalition-party-row${isRejected ? ' is-rejected' : ''}${p.canMajority ? ' can-majority' : ''}`}
              >
                <span className="coalition-swatch" style={{ background: p.colour }} />
                <div className="coalition-party-info">
                  <strong>{p.name}</strong>
                  <small>{p.leader} · {p.seats} seat{p.seats !== 1 ? 's' : ''}</small>
                </div>
                <div className="coalition-meta">
                  <span className="coalition-combined">
                    {playerSeats} + {p.seats} = <strong>{p.combinedSeats}</strong>
                  </span>
                  {p.canMajority && <span className="majority-badge">MAJ</span>}
                  <span className="coalition-compat" style={{ color: p.compatibility >= 60 ? '#1a5c2a' : p.compatibility >= 40 ? '#b8860b' : '#9b1c1c' }}>
                    {p.compatibility}% match
                  </span>
                </div>
                <button
                  className={`ink-button small${isRejected ? ' is-rejected-btn' : ''}`}
                  type="button"
                  disabled={isRejected}
                  onClick={() => propose(p)}
                >
                  {isRejected ? 'Rejected' : 'Propose'}
                </button>
              </div>
            )
          })}
        </div>

        {!anyTryable && (
          <div className="coalition-no-partners">
            <p>No viable partners remain. You can govern as a minority or go into opposition.</p>
          </div>
        )}

        <div className="coalition-actions">
          <button
            className="ink-button secondary small"
            type="button"
            onClick={() => {
              const decisions = generateGovernanceDecisions(1)
              onFormMinority(decisions)
            }}
          >
            Minority government
          </button>
          <button
            className="ink-button secondary small"
            type="button"
            onClick={onOpposition}
          >
            Go into opposition
          </button>
        </div>
      </div>
    </div>
  )
}
