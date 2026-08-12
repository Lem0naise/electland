import type { CampaignAction, World } from '../types/sim'

export function PactsPanel({ world, onAction, onAcceptNpcProposal, onRejectNpcProposal }: {
  world: World
  onAction: (action: CampaignAction) => void
  onAcceptNpcProposal: () => void
  onRejectNpcProposal: () => void
}) {
  const actionAvailable = world.playerActionPoints >= 1
  const playerPacts = world.alliancePacts.filter(
    (p) => !p.broken && (p.partyAId === world.playerPartyId || p.partyBId === world.playerPartyId),
  )

  return (
    <div className="pacts-panel">
      <p className="pacts-intro">
        As party leader you can review and break electoral pacts, and respond to proposals from other parties.
        To strike a new deal, select a ward on the map and negotiate from the Ward tab.
      </p>

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

      {playerPacts.length > 0 ? (
        <div className="pacts-active">
          <div className="panel-kicker">Active pacts</div>
          {playerPacts.map((pact) => {
            const otherId = pact.partyAId === world.playerPartyId ? pact.partyBId : pact.partyAId
            const other = world.parties.find((party) => party.id === otherId)
            const isPartyA = pact.partyAId === world.playerPartyId
            return (
              <div key={pact.id} className="pacts-row">
                <div className="pacts-row-header">
                  <strong style={{ color: other?.colour }}>{other?.name ?? 'Partner'}</strong>
                  <button
                    type="button"
                    className="ink-button secondary small"
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
                {pact.entries.length > 0 && (
                  <ul className="pacts-ward-list">
                    {pact.entries.map((entry) => {
                      const playerStandsDown = isPartyA
                      return (
                        <li key={entry.id} className="pacts-ward-line">
                          {playerStandsDown
                            ? <>You stand down in <strong>{entry.wardAName}</strong>, they stand down in <strong>{entry.wardBName}</strong></>
                            : <>They stand down in <strong>{entry.wardAName}</strong>, you stand down in <strong>{entry.wardBName}</strong></>
                          }
                          {entry.isUnilateral && <span className="pacts-unilateral"> (one-way)</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        !world.pendingNpcProposal && (
          <p className="pacts-empty">No active pacts. Open the Ward tab and select a ward to negotiate.</p>
        )
      )}
    </div>
  )
}
