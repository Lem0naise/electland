import { useState } from 'react'
import {
  assembleMotionDraft,
  listMotionPromptOptions,
  MOTION_PROPOSAL_INFLUENCE_COST,
  predictCouncillorVote,
  previewMotionContestedness,
  suggestCustomMotion,
} from '../lib/sim'
import type { PredictedStance } from '../lib/sim'
import { formatAxis } from '../lib/format'
import type { Councillor, CouncilMotion, CustomMotionInput, MotionCategory, PoliticalValues, World } from '../types/sim'

const CONTESTEDNESS_LABEL: Record<CouncilMotion['contestedness'], string> = {
  broad: 'Broad consensus',
  contested: 'Contested',
  divisive: 'Divisive',
}

export function CouncilChamber({ world, onVote, onResolve, onLobby }: {
  world: World
  onVote: (motionId: string, vote: 'aye' | 'nay' | 'abstain') => void
  onResolve: () => void
  onLobby?: (councillorId: string, motionId: string, desiredVote: 'aye' | 'nay') => void
}) {
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
        <h2>{session.budgetSession ? 'Budget Session' : 'Council Session'} — Week {session.week}</h2>
        <p className="council-subtitle">
          {isResolved
            ? 'Session concluded.'
            : session.budgetSession
              ? 'Debate the budget proposal, lobby councillors, then cast your vote.'
              : 'Debate the motion, lobby councillors, then cast your vote.'}
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

        <div className="council-actions">
          {!isResolved && allVoted && (
            <button type="button" className="ink-button" onClick={onResolve}>
              Conclude Session
            </button>
          )}
          {isResolved && (
            <button type="button" className="ink-button" onClick={onResolve}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FinalVoteGrid({ motion, parties }: { motion: CouncilMotion; parties: Array<{ id: string; name: string; colour: string }> }) {
  const groups: Array<{ vote: 'aye' | 'nay' | 'abstain'; label: string }> = [
    { vote: 'aye', label: 'Aye' },
    { vote: 'nay', label: 'Nay' },
    { vote: 'abstain', label: 'Abstain' },
  ]

  return (
    <section className="final-vote-section">
      <h4>How councillors voted</h4>
      <div className="final-vote-columns">
        {groups.map(({ vote, label }) => {
          const rows = motion.votes.filter((entry) => entry.vote === vote)
          return (
            <div key={vote} className={`final-vote-column vote-${vote}`}>
              <h5>{label} · {rows.length}</h5>
              <div className="final-vote-grid">
                {rows.map((entry) => {
                  const party = parties.find((p) => p.id === entry.partyId)
                  const whip = motion.partyWhipDirection[entry.partyId] ?? 'free'
                  const rebelled = whip !== 'free' && entry.vote !== 'abstain' && entry.vote !== whip
                  return (
                    <div key={entry.councillorId} className={`final-vote-row vote-${entry.vote}`}>
                      <span className="final-vote-dot" style={{ background: party?.colour ?? '#888' }} />
                      <span className="final-vote-name">{entry.councillorName}</span>
                      <span className="final-vote-party">{party?.name ?? entry.partyId}</span>
                      {rebelled && <span className="final-vote-note">rebelled</span>}
                      {entry.councillorId === motion.proposerId && <span className="final-vote-note">proposer</span>}
                    </div>
                  )
                })}
                {rows.length === 0 && <p className="final-vote-empty">None</p>}
              </div>
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
  }) || (motion.proposerId === world.politicianMode?.politician.id
    ? world.parties.find((p) => p.id === world.playerPartyId)
    : undefined)

  return (
    <div className={`council-motion-card${motion.status === 'passed' ? ' passed' : motion.status === 'failed' ? ' failed' : ''}`}>
      <div className="motion-header">
        <span className="motion-category">{motion.category}</span>
        {motion.kind === 'repeal' && <span className="motion-kind-badge">Repeal</span>}
        {motion.kind === 'budget' && <span className="motion-kind-badge">Budget</span>}
        <span className={`motion-contestedness contested-${motion.contestedness}`}>
          {CONTESTEDNESS_LABEL[motion.contestedness]}
        </span>
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

const CATEGORY_OPTIONS: MotionCategory[] = [
  'planning', 'transport', 'housing', 'services', 'environment', 'safety', 'economy', 'governance', 'budget',
]

const CONTESTEDNESS_PREVIEW: Record<CouncilMotion['contestedness'], string> = {
  broad: 'Likely broad consensus',
  contested: 'Likely contested',
  divisive: 'Likely divisive',
}

export function ProposalForm({ onSubmit, onCancel, submitLabel = `Submit Motion (${MOTION_PROPOSAL_INFLUENCE_COST} influence)`, initial, world }: {
  onSubmit: (input: CustomMotionInput) => void
  onCancel: () => void
  submitLabel?: string
  initial?: Partial<CustomMotionInput>
  world?: World
}) {
  const [headline, setHeadline] = useState(initial?.headline ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState<MotionCategory>(initial?.category ?? 'services')
  const [lean, setLean] = useState<PoliticalValues>(initial?.ideologyLean ?? { change: 0, growth: 0, services: 0 })
  const [costSignal, setCostSignal] = useState(initial?.costSignal ?? 0.4)
  const [suggestSalt, setSuggestSalt] = useState(0)
  const [assemblerOpen, setAssemblerOpen] = useState(false)
  const [intervention, setIntervention] = useState('')
  const [subject, setSubject] = useState('')
  const [location, setLocation] = useState('')

  const isRepeal = initial?.kind === 'repeal'
  const prompts = listMotionPromptOptions(category)
  const recentHeadlines = world?.politicianMode?.legislationHistory.map((motion) => motion.headline) ?? []
  const contestedness = previewMotionContestedness(lean, costSignal)

  const applyDraft = (draft: CustomMotionInput & { contestedness?: CouncilMotion['contestedness'] }) => {
    setHeadline(draft.headline)
    setDescription(draft.description)
    setCategory(draft.category)
    setLean({
      change: Math.round(draft.ideologyLean.change),
      growth: Math.round(draft.ideologyLean.growth),
      services: Math.round(draft.ideologyLean.services),
    })
    if (typeof draft.costSignal === 'number') setCostSignal(draft.costSignal)
  }

  const handleSuggest = () => {
    const nextSalt = suggestSalt + 1
    setSuggestSalt(nextSalt)
    const seed = (world?.seed ?? 1) + (world?.week ?? 0) * 97 + nextSalt * 131 + category.length * 11
    applyDraft(suggestCustomMotion(seed, recentHeadlines, category))
  }

  const applyAssembler = (nextIntervention = intervention, nextSubject = subject, nextLocation = location) => {
    if (!nextIntervention || !nextSubject || !nextLocation) return
    const seed = (world?.seed ?? 1) + (world?.week ?? 0) * 53 + nextIntervention.length + nextSubject.length
    applyDraft(assembleMotionDraft({
      category,
      intervention: nextIntervention,
      subject: nextSubject,
      location: nextLocation,
      seedSalt: seed,
    }))
  }

  return (
    <div className="proposal-form">
      <h4>{isRepeal ? 'Propose Repeal' : 'Propose a Motion'}</h4>
      {!isRepeal && (
        <p className="proposal-hint">Pick a suggestion, tap a prompt chip, or assemble from the options below — then edit before submitting.</p>
      )}

      {!isRepeal && (
        <div className="proposal-suggest-row">
          <button type="button" className="ink-button secondary" onClick={handleSuggest}>
            Suggest a motion
          </button>
        </div>
      )}

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
        <label>{isRepeal ? 'Rationale (required)' : 'Description (optional)'}</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isRepeal ? 'Why should this legislation be repealed?' : 'Brief explanation of the motion'}
          maxLength={150}
        />
      </div>
      <div className="proposal-field">
        <label>Category</label>
        <select
          value={category}
          onChange={(e) => {
            const next = e.target.value as MotionCategory
            setCategory(next)
            setIntervention('')
            setSubject('')
            setLocation('')
          }}
          disabled={isRepeal}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>{option[0].toUpperCase()}{option.slice(1)}</option>
          ))}
        </select>
      </div>

      {!isRepeal && (
        <>
          <div className="proposal-chips" aria-label="Intervention prompts">
            {prompts.interventions.slice(0, 5).map((entry) => (
              <button
                key={entry}
                type="button"
                className={`proposal-chip${intervention === entry ? ' is-active' : ''}`}
                onClick={() => {
                  setIntervention(entry)
                  const nextSubject = subject || prompts.subjects[0]
                  const nextLocation = location || prompts.locations[0]
                  setSubject(nextSubject)
                  setLocation(nextLocation)
                  applyAssembler(entry, nextSubject, nextLocation)
                }}
              >
                {entry}
              </button>
            ))}
          </div>
          <div className="proposal-chips" aria-label="Subject prompts">
            {prompts.subjects.slice(0, 5).map((entry) => (
              <button
                key={entry}
                type="button"
                className={`proposal-chip${subject === entry ? ' is-active' : ''}`}
                onClick={() => {
                  setSubject(entry)
                  const nextIntervention = intervention || prompts.interventions[0]
                  const nextLocation = location || prompts.locations[0]
                  setIntervention(nextIntervention)
                  setLocation(nextLocation)
                  applyAssembler(nextIntervention, entry, nextLocation)
                }}
              >
                {entry}
              </button>
            ))}
          </div>

          <details className="proposal-assembler" open={assemblerOpen} onToggle={(event) => setAssemblerOpen((event.target as HTMLDetailsElement).open)}>
            <summary>Custom creator</summary>
            <div className="proposal-assembler-fields">
              <label className="proposal-field">
                Intervention
                <select
                  value={intervention}
                  onChange={(e) => {
                    const next = e.target.value
                    setIntervention(next)
                    applyAssembler(next, subject || prompts.subjects[0], location || prompts.locations[0])
                    if (!subject) setSubject(prompts.subjects[0])
                    if (!location) setLocation(prompts.locations[0])
                  }}
                >
                  <option value="">Choose…</option>
                  {prompts.interventions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label className="proposal-field">
                Subject
                <select
                  value={subject}
                  onChange={(e) => {
                    const next = e.target.value
                    setSubject(next)
                    applyAssembler(intervention || prompts.interventions[0], next, location || prompts.locations[0])
                    if (!intervention) setIntervention(prompts.interventions[0])
                    if (!location) setLocation(prompts.locations[0])
                  }}
                >
                  <option value="">Choose…</option>
                  {prompts.subjects.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label className="proposal-field">
                Place
                <select
                  value={location}
                  onChange={(e) => {
                    const next = e.target.value
                    setLocation(next)
                    applyAssembler(intervention || prompts.interventions[0], subject || prompts.subjects[0], next)
                    if (!intervention) setIntervention(prompts.interventions[0])
                    if (!subject) setSubject(prompts.subjects[0])
                  }}
                >
                  <option value="">Choose…</option>
                  {prompts.locations.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
            </div>
          </details>
        </>
      )}

      <div className="proposal-sliders">
        <div className="proposal-slider">
          <label>Change <span className="slider-val">{formatAxis(lean.change)}</span></label>
          <input type="range" min={-50} max={50} value={lean.change} onChange={(e) => setLean({ ...lean, change: Math.round(+e.target.value) })} />
          <div className="slider-labels"><span>Conservative</span><span>Progressive</span></div>
        </div>
        <div className="proposal-slider">
          <label>Growth <span className="slider-val">{formatAxis(lean.growth)}</span></label>
          <input type="range" min={-50} max={50} value={lean.growth} onChange={(e) => setLean({ ...lean, growth: Math.round(+e.target.value) })} />
          <div className="slider-labels"><span>Restrict</span><span>Develop</span></div>
        </div>
        <div className="proposal-slider">
          <label>Services <span className="slider-val">{formatAxis(lean.services)}</span></label>
          <input type="range" min={-50} max={50} value={lean.services} onChange={(e) => setLean({ ...lean, services: Math.round(+e.target.value) })} />
          <div className="slider-labels"><span>Cut</span><span>Invest</span></div>
        </div>
      </div>
      {!isRepeal && (
        <p className={`proposal-contestedness-preview contested-${contestedness}`}>
          {CONTESTEDNESS_PREVIEW[contestedness]}
        </p>
      )}
      <div className="proposal-actions">
        <button
          type="button"
          className="ink-button"
          disabled={!headline.trim() || (isRepeal && !description.trim())}
          onClick={() => onSubmit({
            headline,
            description,
            category,
            ideologyLean: lean,
            kind: initial?.kind,
            targetMotionId: initial?.targetMotionId,
            costSignal: initial?.costSignal ?? costSignal,
          })}
        >
          {submitLabel}
        </button>
        <button type="button" className="ink-button secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
