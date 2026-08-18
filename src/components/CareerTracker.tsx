import { getCareerRequirements, getTierLabel, type CareerRequirements } from '../lib/sim'
import type { CareerRank, World } from '../types/sim'
import { isPlayerMayor } from '../sim/politics/career'

const RANK_ORDER: CareerRank[] = ['backbencher', 'party-whip', 'party-leader']

export function CareerTracker({ world, onPromote }: { world: World; onPromote: () => void }) {
  const pm = world.politicianMode
  if (!pm) return null

  const pol = pm.politician
  const currentIdx = RANK_ORDER.indexOf(pol.careerRank)
  const nextReqs: CareerRequirements | null = getCareerRequirements(world)
  const isMayor = isPlayerMayor(world)

  return (
    <div className="career-tracker">
      <div className="career-tier-bar">
        {RANK_ORDER.map((rank, i) => (
          <div key={rank} className={`career-tier-step${i <= currentIdx ? ' achieved' : ''}${i === currentIdx ? ' current' : ''}`}>
            <span className="tier-dot" />
            <span className="tier-label">{getTierLabel(rank)}</span>
          </div>
        ))}
      </div>

      <div className="career-current">
        <strong>{getTierLabel(pol.careerRank)}</strong>
        <span className="career-terms">{pol.termsServed} term{pol.termsServed !== 1 ? 's' : ''} served</span>
      </div>

      {isMayor && (
        <div className="career-mayor-badge">
          Mayor of {world.townName}
          {world.victory?.mayorFirstAchievedWeek != null && (
            <span className="career-mayor-since"> (since week {world.victory.mayorFirstAchievedWeek})</span>
          )}
        </div>
      )}

      {!isMayor && pol.careerRank === 'party-leader' && (
        <div className="career-objective">Lead a governing administration to become Mayor.</div>
      )}

      {!isMayor && pol.careerRank !== 'party-leader' && nextReqs && (
        <div className="career-next">
          <div className="career-next-title">Next: {nextReqs.label}</div>
          <div className="career-reqs">
            {nextReqs.requirements.map((req) => (
              <div key={req.label} className={`career-req${req.met ? ' met' : ''}`}>
                <span className="req-check">{req.met ? '\u2713' : '\u2717'}</span>
                <span className="req-label">{req.label}</span>
                <span className="req-progress">{req.current}/{req.needed}</span>
              </div>
            ))}
          </div>
          {nextReqs.eligible && (
            <button type="button" className="ink-button career-promote-btn" onClick={onPromote}>
              {pol.careerRank === 'party-whip' ? 'Launch Leadership Challenge' : 'Accept Promotion'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
