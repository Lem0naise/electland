import type { World } from '../types/sim'

export function WardSwitchModal({ world, onSelect, onClose }: {
  world: World
  onSelect: (wardId: string) => void
  onClose: () => void
}) {
  const pm = world.politicianMode
  if (!pm) return null

  const canSwitch = !pm.politician.isIncumbent && world.weeksUntilElection > 2

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ward-switch-modal" role="dialog" aria-modal="true" aria-labelledby="ward-switch-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="ward-switch-title">{pm.politician.wardId ? 'Seek a New Ward' : 'Choose Your Ward'}</h2>
        <p>
          {canSwitch
            ? 'Your party must approve a change of candidacy. Safe seats held by influential colleagues are harder to secure.'
            : pm.politician.isIncumbent
              ? 'You are currently seated. Finish or lose your term before seeking another nomination.'
              : 'Nominations have closed for this election.'}
        </p>
        <div className="ward-switch-list">
          {world.constituencies.map((ward) => {
            const colleague = pm.councillors.find((councillor) => councillor.wardId === ward.id)
            const samePartySeat = ward.leadingPartyId === pm.politician.partyId
            const status = ward.id === pm.politician.wardId
              ? 'Current ward'
              : samePartySeat && ward.margin >= 10 && (colleague?.influence ?? 0) > 60
                ? 'Protected seat'
                : samePartySeat
                  ? 'Party approval needed'
                  : 'Open contest'
            return (
              <button
                key={ward.id}
                type="button"
                className={`ward-switch-option${ward.id === pm.politician.wardId ? ' is-current' : ''}`}
                disabled={!canSwitch || ward.id === pm.politician.wardId}
                onClick={() => onSelect(ward.id)}
              >
                <span className="ward-switch-name">{ward.name}</span>
                <span className={`ward-switch-status${samePartySeat ? ' is-party-seat' : ' is-open'}`}>{status}</span>
                <span className="ward-switch-meta">Poll leader: {ward.leadingPartyName} · margin {ward.margin.toFixed(1)}pts</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="setup-btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
