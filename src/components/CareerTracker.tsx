import { getCareerRequirements, getTierLabel, type CareerRequirements } from '../lib/sim'
import type { CareerTier, World } from '../types/sim'

const TIER_ORDER: CareerTier[] = ['backbencher', 'committee-chair', 'deputy-leader', 'party-leader', 'mayor']

export function CareerTracker({ world, onPromote }: { world: World; onPromote: () => void }) {
  const pm = world.politicianMode
  if (!pm) return null

  const pol = pm.politician
  const currentIdx = TIER_ORDER.indexOf(pol.careerTier)
  const nextReqs: CareerRequirements | null = getCareerRequirements(world)

  return (
    <div className="career-tracker">
      <div className="career-tier-bar">
        {TIER_ORDER.map((tier, i) => (
          <div key={tier} className={`career-tier-step${i <= currentIdx ? ' achieved' : ''}${i === currentIdx ? ' current' : ''}`}>
            <span className="tier-dot" />
            <span className="tier-label">{getTierLabel(tier)}</span>
          </div>
        ))}
      </div>

      <div className="career-current">
        <strong>{getTierLabel(pol.careerTier)}</strong>
        <span className="career-terms">{pol.termsServed} term{pol.termsServed !== 1 ? 's' : ''} served</span>
      </div>

      {nextReqs && (
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
              Accept Promotion
            </button>
          )}
        </div>
      )}

      {!nextReqs && (
        <div className="career-max">You have reached the highest office.</div>
      )}
    </div>
  )
}
