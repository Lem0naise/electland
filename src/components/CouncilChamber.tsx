import { useState } from 'react'
import { predictCouncillorVote } from '../lib/sim'
import type { PredictedStance } from '../lib/sim'
import type { Councillor, CouncilMotion, CustomMotionInput, MotionCategory, PoliticalValues, World } from '../types/sim'

export function CouncilChamber({ world, onVote, onResolve, onLobby, onProposeCustom }: {
  world: World
  onVote: (motionId: string, vote: 'aye' | 'nay' | 'abstain') => void
  onResolve: () => void
  onLobby?: (councillorId: string, motionId: string, desiredVote: 'aye' | 'nay') => void
  onProposeCustom?: (input: CustomMotionInput) => void
}) {
  const [showProposalForm, setShowProposalForm] = useState(false)

  const pm = world.politicianMode
  if (!pm?.currentSession) return null

  const session = pm.currentSession
  const motion = session.motions[session.motions.length - 1]
  const allVoted = session.motions.every((m) => m.playerVote || m.status === 'passed' || m.status === 'failed')
  const isResolved = session.resolved
  const playerPartyId = world.playerPartyId

  return (
    <div className="modal-backdrop">
      <div className="modal council-chamber-modal" role="dialog" aria-modal="true">
        <h2>Council Session — Week {session.week}</h2>
        <p className="council-subtitle">
          {isResolved ? 'Session concluded.' : 'Debate the motion, lobby councillors, then cast your vote.'}
        </p>

        <MotionCard
          motion={motion}
          playerPartyId={playerPartyId}
          isResolved={isResolved}
          onVote={onVote}
          world={world}
        />

        <PartyWhipRow motion={motion} parties={world.parties} playerPartyId={playerPartyId} />

        {!isResolved && !motion.playerVote && (
          <CouncillorStanceGrid
            motion={motion}
            councillors={pm.councillors}
            world={world}
            playerRelationships={pm.politician.relationships}
            onLobby={onLobby}
            influence={pm.politician.influence}
          />
        )}

        {isResolved && <FinalVoteGrid motion={motion} parties={world.parties} />}

        {isResolved && (() => {
          const rebellions = session.motions.filter((m) => {
            const whip = m.partyWhipDirection[playerPartyId]
            return whip !== 'free' && m.playerVote && m.playerVote !== whip
          }).length
          return rebellions > 0 ? (
            <div className="council-session-summary">
              <p className="rebellion-summary">
                You rebelled against the party whip. Party loyalty decreased.
              </p>
            </div>
          ) : null
        })()}

        {!isResolved && !showProposalForm && onProposeCustom && pm.politician.influence >= 8 && (
          <button type="button" className="propose-motion-btn" onClick={() => setShowProposalForm(true)}>
            Propose Your Own Motion (8 influence)
          </button>
        )}

        {showProposalForm && onProposeCustom && (
          <ProposalForm
            onSubmit={(input) => { onProposeCustom(input); setShowProposalForm(false) }}
            onCancel={() => setShowProposalForm(false)}
          />
        )}

        <div className="council-actions">
          {!isResolved && allVoted && (
            <button type="button" className="setup-btn-primary" onClick={onResolve}>
              Conclude Session
            </button>
          )}
          {isResolved && (
            <button type="button" className="setup-btn-primary" onClick={onResolve}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FinalVoteGrid({ motion, parties }: { motion: CouncilMotion; parties: Array<{ id: string; name: string; colour: string }> }) {
  return (
    <section className="final-vote-section">
      <h4>How councillors voted</h4>
      <div className="final-vote-grid">
        {motion.votes.map((vote) => {
          const party = parties.find((entry) => entry.id === vote.partyId)
          const whip = motion.partyWhipDirection[vote.partyId] ?? 'free'
          const rebelled = whip !== 'free' && vote.vote !== 'abstain' && vote.vote !== whip
          return (
            <div key={vote.councillorId} className={`final-vote-row vote-${vote.vote}`}>
              <span className="final-vote-dot" style={{ background: party?.colour ?? '#888' }} />
              <span className="final-vote-name">{vote.councillorName}</span>
              <span className="final-vote-party">{party?.name ?? vote.partyId}</span>
              <strong>{vote.vote.toUpperCase()}</strong>
              {rebelled && <span className="final-vote-note">rebelled</span>}
              {vote.councillorId === motion.proposerId && <span className="final-vote-note">proposer</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PartyWhipRow({ motion, parties, playerPartyId }: { motion: CouncilMotion; parties: Array<{ id: string; name: string; colour: string }>; playerPartyId: string }) {
  return (
    <div className="party-whip-row">
      {parties.map((party) => {
        const whip = motion.partyWhipDirection[party.id] ?? 'free'
        const isPlayerParty = party.id === playerPartyId
        const whipLabel = isPlayerParty && whip === 'free' && !motion.whipIssuerName
          ? 'FREE VOTE (no whip)'
          : isPlayerParty && motion.whipIssuerName
            ? `${whip.toUpperCase()} — Whip: Cllr. ${motion.whipIssuerName}`
            : whip.toUpperCase()
        return (
          <span key={party.id} className={`party-whip-badge whip-${whip}`}>
            <span className="pwb-dot" style={{ background: party.colour }} />
            <span className="pwb-name">{party.name}</span>
            <span className="pwb-direction">{whipLabel}</span>
          </span>
        )
      })}
    </div>
  )
}

function CouncillorStanceGrid({ motion, councillors, world, playerRelationships, onLobby, influence }: {
  motion: CouncilMotion
  councillors: Councillor[]
  world: World
  playerRelationships: Array<{ targetId: string; strength: number }>
  onLobby?: (councillorId: string, motionId: string, desiredVote: 'aye' | 'nay') => void
  influence: number
}) {
  const stances = councillors.map((c) => ({
    councillor: c,
    predicted: predictCouncillorVote(c, motion, world),
    relationship: playerRelationships.find((r) => r.targetId === c.id)?.strength ?? 0,
  }))

  const playerVoteProjection = motion.playerVote ?? (motion.proposerId === world.politicianMode?.politician.id ? 'aye' : motion.partyWhipDirection[world.playerPartyId] === 'nay' ? 'nay' : 'abstain')
  const projectedAyes = stances.filter((s) => s.predicted === 'aye' || s.predicted === 'lean_aye').length + (playerVoteProjection === 'aye' ? 1 : 0)
  const projectedNays = stances.filter((s) => s.predicted === 'nay' || s.predicted === 'lean_nay').length + (playerVoteProjection === 'nay' ? 1 : 0)
  const undecided = stances.filter((s) => s.predicted === 'undecided').length
  const total = councillors.length + 1
  const majority = Math.floor(total / 2) + 1

  const stanceLabel = (s: PredictedStance) => {
    switch (s) {
      case 'aye': return 'AYE'
      case 'lean_aye': return 'Lean Aye'
      case 'lean_nay': return 'Lean Nay'
      case 'nay': return 'NAY'
      default: return 'Undecided'
    }
  }

  return (
    <div className="councillor-stance-section">
      <div className="stance-projection">
        <span className="proj-label">Projected:</span>
        <span className="proj-aye">{projectedAyes} Aye</span>
        <span className="proj-nay">{projectedNays} Nay</span>
        {undecided > 0 && <span className="proj-undecided">{undecided} Undecided</span>}
        <span className="proj-verdict">
          {projectedAyes >= majority ? '— likely PASS' : projectedNays >= majority ? '— likely FAIL' : '— too close to call'}
        </span>
      </div>
      <div className="stance-grid">
        {stances.map(({ councillor, predicted, relationship }) => {
          const isLobbyable = onLobby && influence >= 5 && (predicted === 'lean_nay' || predicted === 'undecided' || predicted === 'nay')
          const committed = motion.votes.find((vote) => vote.councillorId === councillor.id)
          const whip = motion.partyWhipDirection[councillor.partyId] ?? 'free'
          const reason = committed ? 'Lobbied commitment' : whip === 'free' ? 'Personal position' : `Party whip: ${whip}`
          return (
            <div key={councillor.id} className={`stance-card stance-${predicted}`}>
              <div className="stance-card-top">
                <span className="stance-dot" style={{ background: councillor.partyColour }} />
                <span className="stance-name">{councillor.name}</span>
              </div>
              <div className="stance-card-meta">
                <span className="stance-party">{world.parties.find((p) => p.id === councillor.partyId)?.name}</span>
                <span className={`stance-prediction ${predicted}`}>{stanceLabel(predicted)}</span>
              </div>
              <span className="stance-reason">{reason}</span>
              {relationship !== 0 && (
                <div className="stance-rel-bar">
                  <div
                    className={`stance-rel-fill${relationship > 0 ? ' positive' : ' negative'}`}
                    style={{ width: `${Math.min(100, Math.abs(relationship))}%` }}
                  />
                </div>
              )}
              {isLobbyable && (
                <button type="button" className="stance-lobby-btn" onClick={() => onLobby!(councillor.id, motion.id, 'aye')}>
                  Lobby
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MotionCard({ motion, playerPartyId, isResolved, onVote, world }: {
  motion: CouncilMotion
  playerPartyId: string
  isResolved: boolean
  onVote: (motionId: string, vote: 'aye' | 'nay' | 'abstain') => void
  world: World
}) {
  const whip = motion.partyWhipDirection[playerPartyId]
  const whipLabel = whip === 'aye' ? 'Your whip: Vote Aye' : whip === 'nay' ? 'Your whip: Vote Nay' : 'Free vote'

  const ayes = motion.votes.filter((v) => v.vote === 'aye').length
  const nays = motion.votes.filter((v) => v.vote === 'nay').length
  const abstains = motion.votes.filter((v) => v.vote === 'abstain').length

  const proposerParty = world.parties.find((p) => {
    const cllr = world.politicianMode?.councillors.find((c) => c.id === motion.proposerId)
    return cllr && p.id === cllr.partyId
  })

  return (
    <div className={`council-motion-card${motion.status === 'passed' ? ' passed' : motion.status === 'failed' ? ' failed' : ''}`}>
      <div className="motion-header">
        <span className="motion-category">{motion.category}</span>
        <span className="motion-proposer">
          {proposerParty && <span className="proposer-dot" style={{ background: proposerParty.colour }} />}
          Proposed by {motion.proposerName}
        </span>
      </div>
      <h3 className="motion-headline">{motion.headline}</h3>
      {motion.description && <p className="motion-description">{motion.description}</p>}

      <div className="motion-whip">
        <span className={`whip-indicator ${whip}`}>{whipLabel}</span>
      </div>

      {!isResolved && !motion.playerVote && (
        <div className="motion-vote-buttons">
          <button type="button" className="vote-btn aye" onClick={() => onVote(motion.id, 'aye')}>Aye</button>
          <button type="button" className="vote-btn nay" onClick={() => onVote(motion.id, 'nay')}>Nay</button>
          <button type="button" className="vote-btn abstain" onClick={() => onVote(motion.id, 'abstain')}>Abstain</button>
        </div>
      )}

      {motion.playerVote && !isResolved && (
        <div className="motion-your-vote">
          You voted: <strong>{motion.playerVote.toUpperCase()}</strong>
          {whip !== 'free' && motion.playerVote !== whip && (
            <span className="rebellion-badge">REBELLION</span>
          )}
        </div>
      )}

      {isResolved && (
        <div className="motion-result">
          <span className={`result-badge ${motion.status}`}>
            {motion.status === 'passed' ? 'PASSED' : 'FAILED'}
          </span>
          <span className="result-tally">{ayes} Aye · {nays} Nay · {abstains} Abstain</span>
          {motion.playerVote && whip !== 'free' && motion.playerVote !== whip && (
            <span className="rebellion-badge">You rebelled</span>
          )}
        </div>
      )}
    </div>
  )
}

export function ProposalForm({ onSubmit, onCancel, submitLabel = 'Submit Motion (8 influence)' }: {
  onSubmit: (input: CustomMotionInput) => void
  onCancel: () => void
  submitLabel?: string
}) {
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<MotionCategory>('services')
  const [lean, setLean] = useState<PoliticalValues>({ change: 0, growth: 0, services: 0 })

  return (
    <div className="proposal-form">
      <h4>Propose a Motion</h4>
      <div className="proposal-field">
        <label>Headline</label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Ban parking on High Street"
          maxLength={80}
        />
      </div>
      <div className="proposal-field">
        <label>Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief explanation of the motion"
          maxLength={150}
        />
      </div>
      <div className="proposal-field">
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as MotionCategory)}>
          <option value="planning">Planning</option>
          <option value="budget">Budget</option>
          <option value="services">Services</option>
          <option value="environment">Environment</option>
          <option value="governance">Governance</option>
        </select>
      </div>
      <div className="proposal-sliders">
        <div className="proposal-slider">
          <label>Change <span className="slider-val">{lean.change}</span></label>
          <input type="range" min={-50} max={50} value={lean.change} onChange={(e) => setLean({ ...lean, change: +e.target.value })} />
          <div className="slider-labels"><span>Conservative</span><span>Progressive</span></div>
        </div>
        <div className="proposal-slider">
          <label>Growth <span className="slider-val">{lean.growth}</span></label>
          <input type="range" min={-50} max={50} value={lean.growth} onChange={(e) => setLean({ ...lean, growth: +e.target.value })} />
          <div className="slider-labels"><span>Restrict</span><span>Develop</span></div>
        </div>
        <div className="proposal-slider">
          <label>Services <span className="slider-val">{lean.services}</span></label>
          <input type="range" min={-50} max={50} value={lean.services} onChange={(e) => setLean({ ...lean, services: +e.target.value })} />
          <div className="slider-labels"><span>Cut</span><span>Invest</span></div>
        </div>
      </div>
      <div className="proposal-actions">
        <button type="button" className="setup-btn-primary" disabled={!headline.trim()} onClick={() => onSubmit({ headline, description, category, ideologyLean: lean })}>
          {submitLabel}
        </button>
        <button type="button" className="ink-button secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
