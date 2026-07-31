import type { CouncilMotion } from '../types/sim'

export function CouncilLegislationRegister({ motions }: { motions: CouncilMotion[] }) {
  const passed = motions.filter((motion) => motion.status === 'passed').reverse()
  const archive = [...motions].reverse()

  const tally = (motion: CouncilMotion) => {
    const ayes = motion.votes.filter((vote) => vote.vote === 'aye').length
    const nays = motion.votes.filter((vote) => vote.vote === 'nay').length
    return `${ayes}–${nays}`
  }

  return (
    <div className="council-legislation-register">
      <div className="panel-kicker">Active legislation</div>
      {passed.length > 0 ? (
        <div className="active-legislation-list">
          {passed.map((motion) => (
            <div key={motion.id} className="active-legislation-row">
              <span className="active-legislation-category">{motion.category}</span>
              <strong>{motion.headline}</strong>
              <small>Passed {tally(motion)}</small>
            </div>
          ))}
        </div>
      ) : <p className="council-register-empty">No motions have passed yet.</p>}

      {archive.length > 0 && (
        <details className="council-vote-archive">
          <summary>Vote archive · {archive.length} motion{archive.length !== 1 ? 's' : ''}</summary>
          <div>
            {archive.map((motion) => (
              <div key={motion.id} className={`council-archive-row ${motion.status}`}>
                <span>{motion.status === 'passed' ? 'Passed' : 'Failed'}</span>
                <strong>{motion.headline}</strong>
                <small>{tally(motion)} · proposed by {motion.proposerName}</small>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
