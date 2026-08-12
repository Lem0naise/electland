import type { World } from '../types/sim'

export function VictoryModal({ world, onDismiss }: {
  world: World
  onDismiss: () => void
}) {
  const pol = world.politicianMode?.politician
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const gov = world.government

  const partnerNames = gov?.partnerPartyIds
    .map((id) => world.parties.find((p) => p.id === id)?.name ?? id)
    .join(' & ')

  return (
    <div className="modal-backdrop">
      <div className="modal victory-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-kicker">Extra! Extra!</span>
          <h2>Mayor of {world.townName}</h2>
          <p className="modal-sub">
            Cllr. {pol?.name ?? 'You'} · {playerParty?.name ?? 'your party'}
          </p>
        </div>

        <div className="victory-body">
          <p className="victory-headline">
            {pol?.name ?? 'You'} {gov?.kind === 'coalition'
              ? `leads a coalition with ${partnerNames ?? 'allies'} to become Mayor`
              : gov?.kind === 'minority'
                ? 'forms a minority administration and becomes Mayor'
                : 'commands a majority and becomes Mayor'}
            {' '}of {world.townName} Council.
          </p>

          <div className="victory-stats">
            <div className="victory-stat">
              <span className="victory-stat-label">Week</span>
              <span className="victory-stat-value">{world.week}</span>
            </div>
            <div className="victory-stat">
              <span className="victory-stat-label">Elections held</span>
              <span className="victory-stat-value">{world.electionsHeld}</span>
            </div>
            {pol && (
              <div className="victory-stat">
                <span className="victory-stat-label">Terms served</span>
                <span className="victory-stat-value">{pol.termsServed}</span>
              </div>
            )}
          </div>
        </div>

        <div className="victory-footer">
          <button className="btn" onClick={onDismiss}>Continue playing</button>
        </div>
      </div>
    </div>
  )
}
