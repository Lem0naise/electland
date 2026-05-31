import type { GovernanceDecision, World } from '../types/sim'

export function GovernanceModal({ world, decisions, onDecide, onClose }: {
  world: World
  decisions: GovernanceDecision[]
  onDecide: (decisionId: string, choiceIndex: number) => void
  onClose: () => void
}) {
  const coalitionPartner = world.coalitionPartnerId ? world.parties.find((p) => p.id === world.coalitionPartnerId) : undefined
  const govType = world.coalitionPartnerId ? 'Coalition' : world.minorityGovernment ? 'Minority' : 'Majority'

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
          <span className="modal-kicker">
            {govType === 'Coalition' && coalitionPartner
              ? `Coalition Government — with ${coalitionPartner.name}`
              : govType === 'Minority'
                ? 'Minority Government'
                : 'Council Decision'}
          </span>
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
              <small>{choice.effect.playerUtilityDelta > 0 ? '\u2191 Boosts your support' : choice.effect.playerUtilityDelta < 0 ? '\u2193 Risky for your party' : '\u2192 Neutral for your party'}</small>
            </button>
          ))}
        </div>
        <p className="governance-note">{pending.length - 1} more decision{pending.length - 1 !== 1 ? 's' : ''} pending.</p>
      </div>
    </div>
  )
}
