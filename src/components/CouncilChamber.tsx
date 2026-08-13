import { useState } from 'react'
import {
  MOTION_PROPOSAL_INFLUENCE_COST,
  predictCouncillorVote,
} from '../lib/sim'
import type { PredictedStance } from '../lib/sim'
import { formatAxis } from '../lib/format'
import {
  describeMotionStakes,
  explainCouncillorStance,
  explainPartyWhip,
  formatStakesLine,
} from '../sim/council/presentation'
import { suggestTemplateMotion, templatesForCategory } from '../sim/council/motions'
import type { PolicyTemplate } from '../data/policyTemplates'
import type { Councillor, CouncilMotion, CustomMotionInput, MotionCategory, PoliticalValues, World } from '../types/sim'

const CONTESTEDNESS_LABEL: Record<CouncilMotion['contestedness'], string> = {
  broad: 'Broad consensus',
  contested: 'Contested',
  divisive: 'Divisive',
}

export function CouncilChamber({ world, onVote, onResolve, onLobby, onSelectMotion }: {
  world: World
  onVote: (motionId: string, vote: 'aye' | 'nay' | 'abstain') => void
  onResolve: () => void
  onLobby?: (councillorId: string, motionId: string, desiredVote: 'aye' | 'nay') => void
  onSelectMotion?: (index: number) => void
}) {
  const pm = world.politicianMode
  if (!pm?.currentSession) return null
  const session = pm.currentSession
  const viewIndex = session.activeMotionIndex
  const motion = session.motions[viewIndex] ?? session.motions[0]
  const allVoted = session.motions.every((m) => m.playerVote || m.status === 'passed' || m.status === 'failed')
  const isResolved = session.resolved
  const playerPartyId = world.playerPartyId
  const agendaLabel = (index: number, item: CouncilMotion) => {
    if (item.kind === 'budget' || session.kind === 'budget' || session.budgetSession) {
      return index === 0 && (item.kind === 'budget' || session.kind === 'budget') ? 'Budget' : 'Member business'
    }
    if (session.kind === 'member') return 'Member business'
    if (session.kind === 'government') return 'Government business'
    return index === 0 ? 'Government business' : 'Member business'
  }
  const sessionKicker = agendaLabel(viewIndex, motion)
  const canSelect = (index: number) => {
    if (isResolved) return true
    if (index <= 0) return true
    return session.motions.slice(0, index).every((item) => item.playerVote != null)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal council-chamber-modal" role="dialog" aria-modal="true">
        <h2>{session.kind === 'budget' || session.budgetSession ? 'Budget Session' : 'Council Session'} — Week {session.week}</h2>
        <p className="council-subtitle">
          {isResolved
            ? 'Session concluded.'
            : session.kind === 'budget' || session.budgetSession
              ? 'Vote the government budget. Lobby before you cast your vote.'
              : session.kind === 'member'
                ? 'Member business. Lobby before you cast your vote.'
                : 'Government business. Lobby before you cast your vote.'}
        </p>
        {session.motions.length === 1 && (
          <p className="council-session-kicker">{sessionKicker}</p>
        )}

        {session.motions.length > 1 && (
          <div className="council-agenda-tabs" role="tablist">
            {session.motions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={`council-agenda-tab${index === viewIndex ? ' is-active' : ''}`}
                disabled={!canSelect(index)}
                onClick={() => onSelectMotion?.(index)}
              >
                <span className="council-agenda-kicker">{agendaLabel(index, item)}</span>
                <span className="council-agenda-title">{item.headline}</span>
              </button>
            ))}
          </div>
        )}

        <MotionCard
          motion={motion}
          playerPartyId={playerPartyId}
          isResolved={isResolved}
          onVote={onVote}
          world={world}
        />

        <PartyWhipRow motion={motion} parties={world.parties} playerPartyId={playerPartyId} world={world} />

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

function MotionStakesBlock({ world, motion }: { world: World; motion: CouncilMotion }) {
  const stakes = describeMotionStakes(world, motion)
  return (
    <div className={`motion-stakes cost-${stakes.cost}`}>
      {stakes.helps.length > 0 && <p><strong>Helps:</strong> {stakes.helps.join(', ')}</p>}
      {stakes.hurts.length > 0 && <p><strong>Hurts:</strong> {stakes.hurts.join(', ')}</p>}
      {stakes.budgetLines.length > 0 && <p><strong>Budget:</strong> {stakes.budgetLines.join('; ')}</p>}
      <p><strong>Council cost:</strong> {stakes.costLabel}</p>
      <p><strong>Lean:</strong> {stakes.lean}</p>
    </div>
  )
}

function FinalVoteGrid({ motion, parties }: { motion: CouncilMotion; parties: Array<{ id: string; name: string; colour: string }> }) {
  const groups: Array<{ vote: 'aye' | 'nay' | 'abstain'; label: string }> = [
    { vote: 'aye', label: 'Aye' },
    { vote: 'nay', label: 'Nay' },
    { vote: 'abstain', label: 'Abstain' },
  ]
  const partyTallies = parties.map((party) => {
    const votes = motion.votes.filter((entry) => entry.partyId === party.id)
    return {
      party,
      aye: votes.filter((entry) => entry.vote === 'aye').length,
      nay: votes.filter((entry) => entry.vote === 'nay').length,
    }
  }).filter((row) => row.aye + row.nay > 0)

  return (
    <section className="final-vote-section">
      <h4>How councillors voted</h4>
      {partyTallies.length > 0 && (
        <div className="final-party-tallies">
          {partyTallies.map(({ party, aye, nay }) => (
            <span key={party.id} className="final-party-tally">
              <span className="final-vote-dot" style={{ background: party.colour }} />
              {party.name}: {aye} Aye / {nay} Nay
            </span>
          ))}
        </div>
      )}
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
                      {rebelled && <span className="final-vote-note">broke whip</span>}
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

function PartyWhipRow({ motion, parties, playerPartyId, world }: {
  motion: CouncilMotion
  parties: Array<{ id: string; name: string; colour: string }>
  playerPartyId: string
  world: World
}) {
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
            <span className="pwb-reason">{explainPartyWhip(world, party.id, motion)}</span>
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
          const reason = explainCouncillorStance(world, councillor, motion)
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
      <MotionStakesBlock world={world} motion={motion} />

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
  'planning', 'transport', 'housing', 'services', 'environment', 'safety', 'economy', 'governance',
]

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
  const [templateId, setTemplateId] = useState(initial?.templateId ?? '')
  const [templateIndex, setTemplateIndex] = useState(0)

  const isRepeal = initial?.kind === 'repeal'
  const recentHeadlines = world?.politicianMode?.legislationHistory.map((motion) => motion.headline) ?? []
  const options = templatesForCategory(category, recentHeadlines)
  const selectedTemplate = options.find((template) => template.id === templateId) ?? options[templateIndex] ?? options[0]

  const applyTemplate = (template: PolicyTemplate) => {
    setTemplateId(template.id)
    setHeadline(template.headline)
    setDescription(template.description)
    setCategory(template.category)
    setLean({
      change: template.ideologyLean.change ?? 0,
      growth: template.ideologyLean.growth ?? 0,
      services: template.ideologyLean.services ?? 0,
    })
    setCostSignal(template.costSignal)
  }

  const cycleTemplate = () => {
    if (options.length === 0) return
    const nextIndex = (templateIndex + 1) % options.length
    setTemplateIndex(nextIndex)
    applyTemplate(options[nextIndex])
  }

  const previewStakes = world && selectedTemplate
    ? describeMotionStakes(world, {
      effects: selectedTemplate.effects,
      costSignal,
      ideologyLean: lean,
      kind: 'ordinary',
    })
    : null

  return (
    <div className="proposal-form">
      <h4>{isRepeal ? 'Propose Repeal' : 'Propose a Motion'}</h4>
      {!isRepeal && (
        <p className="proposal-hint">Pick a real bill, preview who it helps and what it costs, then tweak the wording if you like.</p>
      )}

      {!isRepeal && (
        <>
          <div className="proposal-field">
            <label>Category</label>
            <select
              value={category}
              onChange={(e) => {
                const next = e.target.value as MotionCategory
                setCategory(next)
                setTemplateIndex(0)
                const nextOptions = templatesForCategory(next, recentHeadlines)
                if (nextOptions[0]) applyTemplate(nextOptions[0])
              }}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option[0].toUpperCase()}{option.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="proposal-field">
            <label>Bill</label>
            <select
              value={selectedTemplate?.id ?? ''}
              onChange={(e) => {
                const template = options.find((entry) => entry.id === e.target.value)
                if (template) {
                  setTemplateIndex(Math.max(0, options.findIndex((entry) => entry.id === template.id)))
                  applyTemplate(template)
                }
              }}
            >
              {options.map((template) => (
                <option key={template.id} value={template.id}>{template.headline}</option>
              ))}
            </select>
          </div>
          <div className="proposal-suggest-row">
            <button type="button" className="ink-button secondary" onClick={cycleTemplate}>
              Next unused bill
            </button>
            {world && (
              <button
                type="button"
                className="ink-button secondary"
                onClick={() => {
                  const draft = suggestTemplateMotion(world, recentHeadlines, category, templateIndex + 1)
                  const template = options.find((entry) => entry.id === draft.templateId)
                  if (template) applyTemplate(template)
                  else {
                    setHeadline(draft.headline)
                    setDescription(draft.description)
                    setLean(draft.ideologyLean)
                    setCostSignal(draft.costSignal ?? 0.4)
                    setTemplateId(draft.templateId ?? '')
                  }
                }}
              >
                Suggest
              </button>
            )}
          </div>
        </>
      )}

      <div className="proposal-field">
        <label>Headline</label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Restore library opening hours"
          maxLength={80}
        />
      </div>
      <div className="proposal-field">
        <label>{isRepeal ? 'Rationale (required)' : 'Description'}</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isRepeal ? 'Why should this legislation be repealed?' : 'Brief explanation of the motion'}
          maxLength={150}
        />
      </div>

      {!isRepeal && previewStakes && (
        <div className={`motion-stakes cost-${previewStakes.cost}`}>
          <p>{formatStakesLine(previewStakes)}</p>
          <p><strong>Lean:</strong> {previewStakes.lean}</p>
        </div>
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
            costSignal,
            templateId: templateId || selectedTemplate?.id,
            effects: selectedTemplate?.effects,
          })}
        >
          {submitLabel}
        </button>
        <button type="button" className="ink-button secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
