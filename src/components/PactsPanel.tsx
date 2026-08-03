import { useState } from 'react'
import { suggestPacts } from '../lib/sim'
import type { CampaignAction, World } from '../types/sim'

export function PactsPanel({ world, onAction, onAcceptNpcProposal, onRejectNpcProposal }: {
  world: World
  onAction: (action: CampaignAction) => void
  onAcceptNpcProposal: () => void
  onRejectNpcProposal: () => void
}) {
  const actionAvailable = world.playerActionPoints >= 1
  const [allyId, setAllyId] = useState('')
  const allies = world.parties.filter((party) => party.id !== world.playerPartyId)
  const suggestions = allyId ? suggestPacts(world, allyId, 0, 1) : []
  const top = suggestions[0]

  return (
    <div className="pacts-panel">
      <p className="pacts-intro">As party leader you can strike or break electoral pacts. Each move uses your weekly action.</p>

      {world.pendingNpcProposal && (
        <div className="pacts-pending">
          <strong>Incoming proposal</strong>
          <p>
            {world.parties.find((party) => party.id === (world.pendingNpcProposal!.partyAId === world.playerPartyId ? world.pendingNpcProposal!.partyBId : world.pendingNpcProposal!.partyAId))?.name ?? 'A party'}
            {' '}proposes a ward pact.
          </p>
          <div className="pacts-pending-actions">
            <button type="button" className="ink-button" onClick={onAcceptNpcProposal}>Accept</button>
            <button type="button" className="ink-button secondary" onClick={onRejectNpcProposal}>Reject</button>
          </div>
        </div>
      )}

      {world.alliancePacts.length > 0 && (
        <div className="pacts-active">
          <div className="panel-kicker">Active pacts</div>
          {world.alliancePacts.map((pact) => {
            const otherId = pact.partyAId === world.playerPartyId ? pact.partyBId : pact.partyAId
            const other = world.parties.find((party) => party.id === otherId)
            return (
              <div key={pact.id} className="pacts-row">
                <span>{other?.name ?? 'Partner'}</span>
                <button
                  type="button"
                  className="ink-button secondary"
                  disabled={!actionAvailable}
                  onClick={() => onAction({
                    type: 'break_alliance',
                    label: 'Break pact',
                    description: `End the pact with ${other?.name ?? 'partner'}`,
                    apCost: 1,
                    wardId: pact.id,
                    targetPartyId: otherId,
                  })}
                >
                  Break
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="pacts-propose">
        <div className="panel-kicker">Propose a pact</div>
        <label className="pacts-ally-pick">
          Partner
          <select value={allyId} onChange={(event) => setAllyId(event.target.value)} disabled={!actionAvailable}>
            <option value="">Choose a party</option>
            {allies.map((party) => (
              <option key={party.id} value={party.id}>{party.name}</option>
            ))}
          </select>
        </label>
        {top && (
          <p className="pacts-suggestion">
            Suggested: stand down in {world.constituencies.find((ward) => ward.id === top.ourWardId)?.name ?? 'a ward'}
            {' '}for support in {world.constituencies.find((ward) => ward.id === top.theirWardId)?.name ?? 'theirs'}
            {' '}({Math.round(top.acceptanceChance)}% likely to accept).
          </p>
        )}
        <button
          type="button"
          className="ink-button"
          disabled={!actionAvailable || !top || !allyId}
          onClick={() => {
            if (!top || !allyId) return
            onAction({
              type: 'propose_alliance',
              label: `Alliance with ${world.parties.find((party) => party.id === allyId)?.name ?? 'partner'}`,
              description: 'Propose a ward pact',
              apCost: 1,
              targetPartyId: allyId,
              wardId: top.ourWardId,
              allyWardId: top.theirWardId,
            })
          }}
        >
          Propose pact
        </button>
      </div>
    </div>
  )
}
