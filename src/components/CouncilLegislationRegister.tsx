import type { CouncilMotion, World } from '../types/sim'
import { formatStakesLine, describeMotionStakes } from '../sim/council/presentation'

export function CouncilLegislationRegister({ motions, canRepeal, onRepeal, world }: {
  motions: CouncilMotion[]
  canRepeal?: boolean
  onRepeal?: (motionId: string) => void
  world?: World
}) {
  const active = motions.filter((motion) => motion.status === 'passed').reverse()
  const repealed = motions.filter((motion) => motion.status === 'repealed').reverse()
  const archive = [...motions].reverse()

  const tally = (motion: CouncilMotion) => {
    const ayes = motion.votes.filter((vote) => vote.vote === 'aye').length
    const nays = motion.votes.filter((vote) => vote.vote === 'nay').length
    return `${ayes}–${nays}`
  }

  return (
    <div className="council-legislation-register">
      <div className="panel-kicker">Active legislation</div>
      {active.length > 0 ? (
        <div className="active-legislation-list">
          {active.map((motion) => (
            <div key={motion.id} className="active-legislation-row">
              <span className="active-legislation-category">{motion.category}</span>
              <strong>{motion.headline}</strong>
              <small>Passed {tally(motion)}{world ? ` · ${formatStakesLine(describeMotionStakes(world, motion))}` : ''}</small>
              {canRepeal && onRepeal && motion.kind !== 'budget' && (
                <button type="button" className="legislation-repeal-btn" onClick={() => onRepeal(motion.id)}>
                  Repeal
                </button>
              )}
            </div>
          ))}
        </div>
      ) : <p className="council-register-empty">No motions have passed yet.</p>}

      {repealed.length > 0 && (
        <details className="council-vote-archive">
          <summary>Repealed · {repealed.length}</summary>
          <div>
            {repealed.map((motion) => (
              <div key={motion.id} className="council-archive-row repealed">
                <span>Repealed</span>
                <strong>{motion.headline}</strong>
                <small>{tally(motion)} · proposed by {motion.proposerName}</small>
              </div>
            ))}
          </div>
        </details>
      )}

      {archive.length > 0 && (
        <details className="council-vote-archive">
          <summary>Vote archive · {archive.length} motion{archive.length !== 1 ? 's' : ''}</summary>
          <div>
            {archive.map((motion) => (
              <div key={motion.id} className={`council-archive-row ${motion.status}`}>
                <span>{motion.status === 'passed' ? 'Passed' : motion.status === 'repealed' ? 'Repealed' : 'Failed'}</span>
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
