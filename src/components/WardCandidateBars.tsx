import type { Constituency, World } from '../types/sim'

export function WardCandidateBars({ world, constituency }: {
  world: World
  constituency: Constituency
}) {
  const leaderShare = constituency.results[0]?.voteShare ?? 1
  const incumbentPartyId = world.electionsHeld >= 1
    ? world.electionNightResults.find((entry) => entry.wardId === constituency.id)?.winner?.partyId
    : undefined

  return (
    <div className="ward-candidate-bars">
      {constituency.results.map((result, rank) => {
        const barWidth = (result.voteShare / leaderShare) * 100
        const isPlayer = result.partyId === world.playerPartyId
        const isWinner = rank === 0
        const candidate = constituency.candidates.find((entry) => entry.partyId === result.partyId)
        const isIncumbent = incumbentPartyId != null && result.partyId === incumbentPartyId
        return (
          <div key={result.partyId} className={`ward-cand-row${isPlayer ? ' is-player' : ''}${isWinner ? ' is-winner' : ''}`}>
            <div className="ward-cand-identity">
              <span className="ward-cand-initials" style={{ background: result.colour }}>
                {candidate?.initials ?? result.partyName.slice(0, 2).toUpperCase()}
              </span>
              <div className="ward-cand-names">
                <div className="ward-cand-name-row">
                  <span className="ward-cand-name">{candidate?.name ?? result.partyName}</span>
                  {isIncumbent && <span className="incumbent-badge">INC</span>}
                </div>
                <span className="ward-cand-party">{result.partyName}{isPlayer ? ' · Your party' : ''}</span>
              </div>
            </div>
            <div className="ward-cand-bar-col">
              <div className="ward-cand-bar-track">
                <div className="ward-cand-bar-fill" style={{ width: `${barWidth}%`, background: result.colour }} />
              </div>
              <span className="ward-cand-pct">{result.voteShare.toFixed(1)}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
