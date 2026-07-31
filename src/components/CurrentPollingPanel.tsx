import type { Constituency, World } from '../types/sim'

export function CurrentPollingPanel({ world, constituency }: { world: World; constituency?: Constituency }) {
  if (!constituency) {
    return (
      <section className="panel current-polling-panel">
        <div className="panel-kicker">Current polling</div>
        <p>Select a ward on the map to view its candidates and polling.</p>
      </section>
    )
  }

  const leadingResult = constituency.results[0]
  const playerWard = world.politicianMode?.politician.wardId === constituency.id
  const tacticalNotes = constituency.results.slice(2)
    .map((result) => ({ result, pressure: constituency.tacticalPressure?.[result.partyId] ?? 1 }))
    .filter(({ pressure }) => pressure > 0.05)

  return (
    <section className="panel current-polling-panel">
      <div className="polling-panel-header">
        <div>
          <div className="panel-kicker">Current polling</div>
          <h3>{constituency.name}</h3>
        </div>
        {playerWard && <span className="your-ward-badge">YOUR WARD</span>}
      </div>
      <div className="current-polling-list">
        {constituency.results.map((result, index) => {
          const candidate = constituency.candidates.find((entry) => entry.partyId === result.partyId)
          const isPlayer = result.partyId === world.playerPartyId
          return (
            <div key={result.partyId} className={`current-polling-row${isPlayer ? ' is-player' : ''}`}>
              <span className="current-polling-rank">{index + 1}</span>
              <span className="current-polling-initials" style={{ background: result.colour }}>{candidate?.initials ?? '?'}</span>
              <div className="current-polling-person">
                <strong>{candidate?.name ?? 'Candidate pending'}</strong>
                <span><i style={{ background: result.colour }} />{result.partyName}{isPlayer ? ' · Your party' : ''}</span>
              </div>
              <div className="current-polling-bar"><div style={{ width: `${result.voteShare}%`, background: result.colour }} /></div>
              <strong className="current-polling-share">{result.voteShare.toFixed(1)}%</strong>
            </div>
          )
        })}
      </div>
      {leadingResult && <p className="current-polling-summary">{leadingResult.partyName} leads by {constituency.margin.toFixed(1)} points.</p>}
      {tacticalNotes.length > 0 && (
        <p className="current-polling-tactical">
          Tactical voting: {tacticalNotes.map(({ result, pressure }) => `${result.partyName} ${pressure < 0.5 ? 'is breaking through' : pressure < 0.85 ? 'is under easing pressure' : 'is under pressure'}`).join(' · ')}
        </p>
      )}
    </section>
  )
}
