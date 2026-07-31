import { useEffect, useState } from 'react'
import { getAvailableActions, suggestPacts } from '../lib/sim'
import type { ActiveCampaign, CampaignAction, World } from '../types/sim'

export function CampaignActionsPanel({ world, selectedWardId, onAction, onTogglePermanent, onAcceptNpcProposal, onRejectNpcProposal }: {
  world: World
  selectedWardId: string
  onAction: (action: CampaignAction) => void
  onTogglePermanent: (campaign: ActiveCampaign) => void
  onAcceptNpcProposal?: () => void
  onRejectNpcProposal?: () => void
}) {
  const [focusWardId, setFocusWardId] = useState(selectedWardId)
  const [smearTargetId, setSmearTargetId] = useState('')
  const [policyAxis, setPolicyAxis] = useState<'change' | 'growth' | 'services'>('change')
  const [policyDir, setPolicyDir] = useState<1 | -1>(1)
  const [showSmearConfig, setShowSmearConfig] = useState(false)
  const [showPolicyConfig, setShowPolicyConfig] = useState(false)
  const [showAllianceConfig, setShowAllianceConfig] = useState(false)
  const [alliancePartyId, setAlliancePartyId] = useState('')
  const [allianceMode, setAllianceMode] = useState<'theyForMe' | 'iForThem'>('theyForMe')
  const [checkedPairs, setCheckedPairs] = useState<Set<string>>(new Set())
  const [expandedBreakdownId, setExpandedBreakdownId] = useState<string | null>(null)
  const [breakConfirmPactId, setBreakConfirmPactId] = useState<string | null>(null)

  useEffect(() => {
    setFocusWardId(selectedWardId)
  }, [selectedWardId])

  const ap = world.playerActionPoints
  const actions = getAvailableActions(world)
  const focusWard = world.constituencies.find((c) => c.id === focusWardId)
  const opponents = world.parties.filter((p) => p.id !== world.playerPartyId)
  const isBattleground = focusWard ? world.stats.battlegroundWardIds.includes(focusWard.id) : false
  const playerIsLeading = focusWard?.leadingPartyId === world.playerPartyId

  const playerHeldWards = new Set<string>()
  if (world.electionsHeld >= 1) {
    world.electionNightResults.forEach((r) => {
      if (r.winner?.partyId === world.playerPartyId) playerHeldWards.add(r.wardId)
    })
  }
  const isIncumbentInFocusWard = focusWard ? playerHeldWards.has(focusWard.id) : false

  const activePermanentIds = new Set(
    world.activeCampaigns.filter((c) => c.wardId === focusWardId).map((c) => c.type)
  )
  const totalPermanentDrain = world.activeCampaigns.reduce((sum, c) => sum + c.apCostPerTurn, 0)

  function doAction(type: CampaignAction['type'], overrides: Partial<CampaignAction> = {}) {
    const match = actions.find((a) =>
      a.type === type &&
      (type === 'policy_shift' || a.wardId === focusWardId) &&
      (type !== 'smear' || a.targetPartyId === smearTargetId) &&
      (type !== 'policy_shift' || (a.policyAxis === policyAxis && a.policyDirection === policyDir)),
    )
    if (match) onAction({ ...match, ...overrides })
  }

  function togglePermanent(action: CampaignAction) {
    if (!action.wardId) return
    const existing = world.activeCampaigns.find((c) => c.wardId === action.wardId && c.type === action.type)
    if (existing) {
      onTogglePermanent(existing)
    } else {
      const newCampaign: ActiveCampaign = {
        id: `${action.type}-${action.wardId}-${world.week}`,
        type: action.type as ActiveCampaign['type'],
        label: action.label,
        apCostPerTurn: action.permanentApCost ?? 1,
        wardId: action.wardId,
      }
      onTogglePermanent(newCampaign)
    }
  }

  const hasEvent = world.weeklyEvent && !world.weeklyEvent.resolved

  const setPairChecked = (key: string, checked: boolean) => {
    setCheckedPairs((p) => { const n = new Set(p); if (checked) n.add(key); else n.delete(key); return n })
  }

  const activePlayerPacts = world.alliancePacts.filter((p) =>
    !p.broken && (p.partyAId === world.playerPartyId || p.partyBId === world.playerPartyId)
  )
  const activeNpcPacts = world.alliancePacts.filter((p) =>
    !p.broken && p.partyAId !== world.playerPartyId && p.partyBId !== world.playerPartyId
  )

  const repPenaltyFor = (partyId: string): number => {
    const repKey = [world.playerPartyId, partyId].sort().join('_')
    return world.allianceReputation[repKey] ?? 0
  }

  return (
    <div className="campaign-panel">
      {hasEvent && (
        <div className="event-card">
          <div className="event-kicker">This week's issue</div>
          <h4 className="event-headline">{world.weeklyEvent!.headline}</h4>
          <p className="event-desc">{world.weeklyEvent!.description}</p>
          <div className="event-choices">
            {world.weeklyEvent!.choices.map((choice, index) => (
              <button
                key={index}
                className={`event-choice-btn${ap < 1 ? ' is-disabled' : ''}`}
                type="button"
                disabled={ap < 1}
                onClick={() => onAction({
                  type: 'respond_event',
                  label: choice.label,
                  description: choice.description,
                  apCost: 1,
                  eventChoiceIndex: index,
                })}
              >
                <strong>{choice.label}</strong>
                <span>{choice.description}</span>
                <span className="ap-cost-badge">1 AP</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {world.activeCampaigns.length > 0 && (
        <div className="permanent-drain-notice">
          <span className="pdn-icon">{'\u27F3'}</span>
          <span className="pdn-text">
            {world.activeCampaigns.length} running:{' '}
            {(() => {
              const byType = new Map<string, { count: number; apCost: number }>()
              for (const c of world.activeCampaigns) {
                const key = c.type
                const cur = byType.get(key) ?? { count: 0, apCost: c.apCostPerTurn }
                cur.count++
                byType.set(key, cur)
              }
              const labels: Record<string, string> = { canvass: 'Canvass', ads: 'Ads', fix_potholes: 'Potholes', improve_bins: 'Bins' }
              return [...byType.entries()].map(([type, info]) =>
                `${labels[type] ?? type} (${info.count * info.apCost}AP)`
              ).join(' + ')
            })()}
            {' '}— draining {Math.min(3, totalPermanentDrain)}/{world.maxActionPoints} AP weekly
          </span>
          <button
            type="button"
            className="pdn-stop-all"
            onClick={() => {
              for (const c of [...world.activeCampaigns]) {
                onTogglePermanent(c)
              }
            }}
            title="Stop all auto-campaigns"
          >
            {'\u2715'} Stop all
          </button>
        </div>
      )}

      {/* NPC alliance proposal to player */}
      {world.pendingNpcProposal && !world.pendingNpcProposal.broken && (() => {
        const p = world.pendingNpcProposal
        const npcParty = world.parties.find((pa) => pa.id === p.partyAId)
        const entry = p.entries[0]
        const theirWard = world.constituencies.find((c) => c.id === entry?.wardA)
        const ourWard = world.constituencies.find((c) => c.id === entry?.wardB)
        const boostForUs = (entry?.endorsementForA ?? 0) * 0.01
        return (
          <div className="npc-proposal-prompt">
            <div className="npc-proposal-header">
              <span className="npc-proposal-icon">{'\uD83E\uDD1D'}</span>
              <span>
                <strong>{npcParty?.name ?? '?'}</strong>
                {' '}proposes a pact with you
              </span>
            </div>
            <div className="npc-proposal-details">
              <span>
                They stand down in <em>{theirWard?.name ?? '?'}</em>
                {' ⇄ '}
                You stand down in <em>{ourWard?.name ?? '?'}</em>
                {' '}
                <span className="alliance-boost">
                  (+{boostForUs.toFixed(1)}% from their endorsement)
                </span>
              </span>
            </div>
            <div className="npc-proposal-actions">
              <button
                className="ink-button small"
                type="button"
                onClick={() => onAcceptNpcProposal?.()}
              >
                {'\u2713'} Accept
              </button>
              <button
                className="ink-button secondary small"
                type="button"
                onClick={() => onRejectNpcProposal?.()}
                title="Rejecting damages reputation (-0.15)"
              >
                {'\u2717'} Reject
              </button>
            </div>
          </div>
        )
      })()}

      {/* Active alliance pacts */}
      {(activePlayerPacts.length > 0 || activeNpcPacts.length > 0) && (
        <div className="alliance-pacts-display">
          {activePlayerPacts.map((pact) => {
            const otherPartyId = pact.partyAId === world.playerPartyId ? pact.partyBId : pact.partyAId
            const otherParty = world.parties.find((p) => p.id === otherPartyId)
            const playerIsPartyA = pact.partyAId === world.playerPartyId

            const isExpanded = expandedBreakdownId === pact.id
            const isConfirming = breakConfirmPactId === pact.id

            const pactEntries = pact.entries.map((e) => {
              const ourWard = world.constituencies.find((c) => c.id === (playerIsPartyA ? e.wardA : e.wardB))
              const theirWard = world.constituencies.find((c) => c.id === (playerIsPartyA ? e.wardB : e.wardA))
              const ourGain = playerIsPartyA ? e.endorsementForA * 0.01 * 25 : e.endorsementForB * 0.01 * 25
              const theirGain = playerIsPartyA ? e.endorsementForB * 0.01 * 25 : e.endorsementForA * 0.01 * 25
              return { entry: e, ourWard, theirWard, ourGain, theirGain }
            })

            return (
              <div key={pact.id} className="alliance-pact-card">
                <div className="alliance-pact-summary">
                  <span className="alliance-pact-indicator">{'\uD83E\uDD1D'}</span>
                  <span className="alliance-pact-text">
                    Pact with <strong>{otherParty?.name ?? otherPartyId}</strong>
                    {' — '}{pact.entries.length} ward{pact.entries.length !== 1 ? 's' : ''}
                  </span>
                  <div className="alliance-pact-actions">
                    <button
                      type="button"
                      className="alliance-expand-btn"
                      onClick={() => setExpandedBreakdownId(isExpanded ? null : pact.id)}
                    >
                      {isExpanded ? '\u25B2' : '\u25BC'}
                    </button>
                    {isConfirming ? (
                      <span className="alliance-break-confirm">
                        <span className="alliance-break-confirm-text">Break pact?{' '}
                          <span className="alliance-boost" style={{ color: 'var(--accent-red)' }}>
                            -{(repPenaltyFor(otherPartyId) * 0.15 * 100).toFixed(1)}% future accept
                          </span>
                        </span>
                        <button type="button" className="alliance-break-btn is-confirm" onClick={() => {
                          onAction({
                            type: 'break_alliance',
                            label: `Break pact with ${otherParty?.name ?? otherPartyId}`,
                            description: '',
                            apCost: 0,
                            targetPartyId: otherPartyId,
                            wardId: pact.id,
                          })
                          setBreakConfirmPactId(null)
                        }}>
                          Yes, break
                        </button>
                        <button type="button" className="alliance-break-btn is-cancel" onClick={() => setBreakConfirmPactId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="alliance-break-btn"
                        onClick={() => setBreakConfirmPactId(pact.id)}
                        title="Break this pact"
                      >
                        {'\u2715'}
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="alliance-pact-entries">
                    <div className="pact-table-header">
                      <span>You stand down</span>
                      <span>{'\u21C4'}</span>
                      <span>They stand down</span>
                      <span className="pact-th-gain">~You</span>
                      <span className="pact-th-gain">~Them</span>
                    </div>
                    {pactEntries.map((pe) => (
                      <div key={pe.entry.id} className="pact-table-row">
                        <span className="pact-td-ward">{pe.ourWard?.name ?? '?'}</span>
                        <span className="pact-td-arrow">{'\u21C4'}</span>
                        <span className="pact-td-ward">{pe.theirWard?.name ?? '?'}</span>
                        <span className="pact-td-gain">+{pe.ourGain.toFixed(1)}%</span>
                        <span className="pact-td-gain">+{pe.theirGain.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {activeNpcPacts.map((pact) => {
            const partyA = world.parties.find((p) => p.id === pact.partyAId)
            const partyB = world.parties.find((p) => p.id === pact.partyBId)
            const wardNames = pact.entries.map((e) => {
              const aW = world.constituencies.find((c) => c.id === e.wardA)
              const bW = world.constituencies.find((c) => c.id === e.wardB)
              return `${partyA?.name ?? '?'} in ${aW?.name ?? '?'}, ${partyB?.name ?? '?'} in ${bW?.name ?? '?'}`
            }).join(' · ')
            return (
              <div key={pact.id} className="alliance-pact-row is-npc">
                <span className="alliance-pact-indicator">{'\uD83E\uDD1D'}</span>
                <span className="alliance-pact-text">
                  <strong>{partyA?.name ?? pact.partyAId}</strong> ↔ <strong>{partyB?.name ?? pact.partyBId}</strong>
                  {`: ${wardNames}`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {focusWard
        ? (
            <div className={`focus-ward-poll${isBattleground ? ' is-battleground' : ''}`}>
              <div className="fwp-header">
                <div className="fwp-targeting">
                  <span className="fwp-targeting-label">Targeting</span>
                  <strong className="fwp-ward-name">{focusWard.name}</strong>
                  {isBattleground && <span className="battleground-badge">BATTLEGROUND</span>}
                  {isIncumbentInFocusWard && <span className="incumbent-ward-badge">YOUR WARD</span>}
                </div>
                <span className="fwp-hint">click map to change</span>
              </div>


              <div className="fwp-candidate-bars">
                {focusWard.results.map((r, rank) => {
                  const leaderShare = focusWard.results[0]?.voteShare ?? 1
                  const barWidth = (r.voteShare / leaderShare) * 100
                  const isPlayer = r.partyId === world.playerPartyId
                  const isWinner = rank === 0
                  const candidate = focusWard.candidates?.find((c) => c.partyId === r.partyId)
                  const incumbentPartyId = world.electionsHeld >= 1
                    ? world.electionNightResults.find((en) => en.wardId === focusWard.id)?.winner?.partyId
                    : undefined
                  const isIncumbent = incumbentPartyId != null && r.partyId === incumbentPartyId
                  return (
                    <div key={r.partyId} className={`fwp-cand-row${isPlayer ? ' is-player' : ''}${isWinner ? ' is-winner' : ''}`}>
                      <div className="fwp-cand-identity">
                        <span className="fwp-cand-initials" style={{ background: r.colour }}>
                          {candidate?.initials ?? r.partyName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="fwp-cand-names">
                          <div className="fwp-cand-name-row">
                            <span className="fwp-cand-name">{candidate?.name ?? r.partyName}</span>
                            {isIncumbent && <span className="incumbent-badge">INC</span>}
                          </div>
                          <span className="fwp-cand-party">{r.partyName}</span>
                        </div>
                      </div>
                      <div className="fwp-cand-bar-col">
                        <div className="fwp-cand-bar-track">
                          <div
                            className="fwp-cand-bar-fill"
                            style={{ width: `${barWidth}%`, background: r.colour }}
                          />
                        </div>
                        <span className="fwp-cand-pct">{r.voteShare.toFixed(1)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="fwp-status">
                {playerIsLeading
                  ? <span className="fwp-margin-leading">Leading by {focusWard.margin.toFixed(1)}pts</span>
                  : <span className="fwp-margin-trailing">Trailing by {focusWard.margin.toFixed(1)}pts</span>}
              </div>

              {world.activeCampaigns.filter((c) => c.wardId === focusWardId).length > 0 && (
                <div className="fwp-auto-status">
                  <span className="fwp-auto-label">{'\u27F3'} Auto:</span>
                  {world.activeCampaigns.filter((c) => c.wardId === focusWardId).map((c) => {
                    const labels: Record<string, string> = { canvass: 'Canvass', ads: 'Ads', fix_potholes: 'Potholes', improve_bins: 'Bins' }
                    return (
                      <span key={c.id} className="fwp-auto-campaign">
                        {labels[c.type] ?? c.type}
                      </span>
                    )
                  })}
                  <span className="fwp-auto-boost">{(() => {
                    const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
                    const boost = playerParty?.wardBoosts[focusWard.id] ?? 0
                    return `(+${(boost * 100).toFixed(1)}% effect)`
                  })()}</span>
                </div>
              )}
            </div>
          )
        : <p className="campaign-no-ward">Click a ward on the map to target it.</p>}

      <div className="action-cards">
        {isIncumbentInFocusWard ? (
          <>
            <div className="action-section-label">
              <span className="asl-kicker">Your ward</span>
              <span className="asl-desc">You hold {focusWard?.name ?? 'this ward'} — use your position.</span>
            </div>

            {(() => {
              const isPermanentActive = activePermanentIds.has('fix_potholes')
              const canAfford = ap >= 1
              return (
                <div className={`action-card action-card-gov${!canAfford && !isPermanentActive ? ' is-disabled' : ''}${isPermanentActive ? ' is-permanent-active' : ''}`}>
                  <button type="button" className="ac-expand-toggle" onClick={() => doAction('fix_potholes')} disabled={!canAfford && !isPermanentActive}>
                    <div className="ac-header">
                      <span className="ac-name">Fix the potholes</span>
                      <span className={`ac-cost${!canAfford ? ' cant-afford' : ''}`}>1 AP</span>
                    </div>
                    <span className="ac-desc">Get the roads sorted. Visible action, grateful residents.</span>
                  </button>
                  <div className="ac-permanent-row">
                    <button
                      type="button"
                      className={`ac-permanent-toggle${isPermanentActive ? ' is-on' : ''}`}
                      onClick={() => {
                        const action = actions.find((a) => a.type === 'fix_potholes' && a.wardId === focusWardId)
                        if (action) togglePermanent(action)
                      }}
                      title={isPermanentActive ? 'Stop automated action' : 'Auto-boost builds weekly: adds to ward support. Steadies after a few weeks.'}
                    >
                      {isPermanentActive ? '\u27F3 Auto ON — 1 AP/wk' : '\u27F3 Set to auto'}
                    </button>
                  </div>
                </div>
              )
            })()}

            {(() => {
              const isPermanentActive = activePermanentIds.has('improve_bins')
              const canAfford = ap >= 1
              return (
                <div className={`action-card action-card-gov${!canAfford && !isPermanentActive ? ' is-disabled' : ''}${isPermanentActive ? ' is-permanent-active' : ''}`}>
                  <button type="button" className="ac-expand-toggle" onClick={() => doAction('improve_bins')} disabled={!canAfford && !isPermanentActive}>
                    <div className="ac-header">
                      <span className="ac-name">Improve bin collections</span>
                      <span className={`ac-cost${!canAfford ? ' cant-afford' : ''}`}>1 AP</span>
                    </div>
                    <span className="ac-desc">Sort out the missed collections. Dull, but voters notice.</span>
                  </button>
                  <div className="ac-permanent-row">
                    <button
                      type="button"
                      className={`ac-permanent-toggle${isPermanentActive ? ' is-on' : ''}`}
                      onClick={() => {
                        const action = actions.find((a) => a.type === 'improve_bins' && a.wardId === focusWardId)
                        if (action) togglePermanent(action)
                      }}
                      title={isPermanentActive ? 'Stop automated action' : 'Auto-boost builds weekly: adds to ward support. Steadies after a few weeks.'}
                    >
                      {isPermanentActive ? '\u27F3 Auto ON — 1 AP/wk' : '\u27F3 Set to auto'}
                    </button>
                  </div>
                </div>
              )
            })()}

            <button
              type="button"
              className={`action-card action-card-rally${ap < 3 ? ' is-disabled' : ''}`}
              disabled={ap < 3}
              onClick={() => doAction('ward_festival')}
            >
              <div className="ac-header">
                <span className="ac-name">Host a ward festival</span>
                <span className={`ac-cost${ap < 3 ? ' cant-afford' : ''}`}>3 AP</span>
              </div>
              <span className="ac-desc">Big community event. Brilliant if it lands — embarrassing if it flops.</span>
            </button>

            {(() => {
              const isPermanentActive = activePermanentIds.has('canvass')
              const canAfford = ap >= 1
              return (
                <div className={`action-card${!canAfford && !isPermanentActive ? ' is-disabled' : ''}${isPermanentActive ? ' is-permanent-active' : ''}`}>
                  <button type="button" className="ac-expand-toggle" onClick={() => doAction('canvass')} disabled={!canAfford && !isPermanentActive}>
                    <div className="ac-header">
                      <span className="ac-name">Canvass doors</span>
                      <span className={`ac-cost${!canAfford ? ' cant-afford' : ''}`}>1 AP</span>
                    </div>
                    <span className="ac-desc">Keep the volunteers knocking. Good incumbent maintenance.</span>
                  </button>
                  <div className="ac-permanent-row">
                    <button
                      type="button"
                      className={`ac-permanent-toggle${isPermanentActive ? ' is-on' : ''}`}
                      onClick={() => {
                        const action = actions.find((a) => a.type === 'canvass' && a.wardId === focusWardId)
                        if (action) togglePermanent(action)
                      }}
                      title={isPermanentActive ? 'Stop automated action' : 'Auto-boost builds weekly: adds to ward support. Steadies after a few weeks.'}
                    >
                      {isPermanentActive ? '\u27F3 Auto ON — 1 AP/wk' : '\u27F3 Set to auto'}
                    </button>
                  </div>
                </div>
              )
            })()}
          </>
        ) : (
          <>
            {(() => {
              const isPermanentActive = activePermanentIds.has('canvass')
              const canAfford = ap >= 1
              return (
                <div className={`action-card${!canAfford && !isPermanentActive ? ' is-disabled' : ''}${isPermanentActive ? ' is-permanent-active' : ''}`}>
                  <button type="button" className="ac-expand-toggle" onClick={() => doAction('canvass')} disabled={!canAfford && !isPermanentActive}>
                    <div className="ac-header">
                      <span className="ac-name">Canvass doors</span>
                      <span className={`ac-cost${!canAfford ? ' cant-afford' : ''}`}>1 AP</span>
                    </div>
                    <span className="ac-desc">Steady support boost in {focusWard?.name ?? 'ward'}. Safe bet.</span>
                  </button>
                  <div className="ac-permanent-row">
                    <button
                      type="button"
                      className={`ac-permanent-toggle${isPermanentActive ? ' is-on' : ''}`}
                      onClick={() => {
                        const action = actions.find((a) => a.type === 'canvass' && a.wardId === focusWardId)
                        if (action) togglePermanent(action)
                      }}
                      title={isPermanentActive ? 'Stop automated action' : 'Auto-boost builds weekly: adds to ward support. Steadies after a few weeks.'}
                    >
                      {isPermanentActive ? '\u27F3 Auto ON — 1 AP/wk' : '\u27F3 Set to auto'}
                    </button>
                  </div>
                </div>
              )
            })()}

            {(() => {
              const isPermanentActive = activePermanentIds.has('ads')
              const canAfford = ap >= 2
              return (
                <div className={`action-card${!canAfford && !isPermanentActive ? ' is-disabled' : ''}${isPermanentActive ? ' is-permanent-active' : ''}`}>
                  <button type="button" className="ac-expand-toggle" onClick={() => doAction('ads')} disabled={!canAfford && !isPermanentActive}>
                    <div className="ac-header">
                      <span className="ac-name">Run local ads</span>
                      <span className={`ac-cost${!canAfford ? ' cant-afford' : ''}`}>2 AP</span>
                    </div>
                    <span className="ac-desc">Bigger boost than canvassing. Good for closing a gap.</span>
                  </button>
                  <div className="ac-permanent-row">
                    <button
                      type="button"
                      className={`ac-permanent-toggle${isPermanentActive ? ' is-on' : ''}`}
                      onClick={() => {
                        const action = actions.find((a) => a.type === 'ads' && a.wardId === focusWardId)
                        if (action) togglePermanent(action)
                      }}
                      title={isPermanentActive ? 'Stop automated action' : 'Auto-boost builds weekly: adds to ward support. Steadies after a few weeks.'}
                    >
                      {isPermanentActive ? '\u27F3 Auto ON — 2 AP/wk' : '\u27F3 Set to auto'}
                    </button>
                  </div>
                </div>
              )
            })()}

            <button
              type="button"
              className={`action-card action-card-rally${ap < 3 ? ' is-disabled' : ''}`}
              disabled={ap < 3}
              onClick={() => doAction('rally')}
            >
              <div className="ac-header">
                <span className="ac-name">Hold a rally</span>
                <span className={`ac-cost${ap < 3 ? ' cant-afford' : ''}`}>3 AP</span>
              </div>
              <span className="ac-desc">High risk, high reward. Could surge — or fall flat.</span>
            </button>
          </>
        )}

        <div className={`action-card action-card-smear${ap < 2 ? ' is-disabled' : ''}`}>
          <button
            type="button"
            className="ac-expand-toggle"
            onClick={() => setShowSmearConfig((s) => !s)}
            disabled={ap < 2}
          >
            <div className="ac-header">
              <span className="ac-name">Attack opponent</span>
              <span className={`ac-cost${ap < 2 ? ' cant-afford' : ''}`}>2 AP</span>
            </div>
            <span className="ac-desc">Hurt opponent in this ward. Backfire risk.</span>
          </button>
          {showSmearConfig && ap >= 2 && (
            <div className="ac-config">
              <select
                value={smearTargetId}
                onChange={(e) => setSmearTargetId(e.target.value)}
                className="ac-select"
              >
                <option value="">Pick a target...</option>
                {opponents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                className="ink-button small"
                type="button"
                disabled={!smearTargetId}
                onClick={() => doAction('smear')}
              >
                Launch attack
              </button>
            </div>
          )}
        </div>

        {!world.policyShiftUsedThisCycle
          ? (
              <div className="action-card action-card-policy">
                <button
                  type="button"
                  className="ac-expand-toggle"
                  onClick={() => setShowPolicyConfig((s) => !s)}
                >
                  <div className="ac-header">
                    <span className="ac-name">Shift policy</span>
                    <span className="ac-cost ac-free">Free</span>
                  </div>
                  <span className="ac-desc">Move your party's position. Once per cycle.</span>
                </button>
                {showPolicyConfig && (
                  <div className="ac-config">
                    <select
                      value={policyAxis}
                      onChange={(e) => setPolicyAxis(e.target.value as 'change' | 'growth' | 'services')}
                      className="ac-select"
                    >
                      <option value="change">Reform / Change</option>
                      <option value="growth">Economic Growth</option>
                      <option value="services">Public Services</option>
                    </select>
                    <div className="policy-dir-row">
                      <button type="button" className={`policy-dir-btn${policyDir === 1 ? ' is-active' : ''}`} onClick={() => setPolicyDir(1)}>More</button>
                      <button type="button" className={`policy-dir-btn${policyDir === -1 ? ' is-active' : ''}`} onClick={() => setPolicyDir(-1)}>Less</button>
                    </div>
                    <button
                      className="ink-button small"
                      type="button"
                      onClick={() => doAction('policy_shift')}
                    >
                      Apply shift
                    </button>
                  </div>
                )}
              </div>
            )
          : (
              <div className="action-card is-disabled is-used">
                <div className="ac-header">
                  <span className="ac-name">Policy shift</span>
                  <span className="ac-cost ac-used">Used this cycle</span>
                </div>
              </div>
            )}
      </div>

      {/* Alliance proposal */}
      <div className={`action-card${ap < 2 ? ' is-disabled' : ''}`}>
        <button
          type="button"
          className="ac-expand-toggle"
          onClick={() => setShowAllianceConfig((s) => !s)}
          disabled={ap < 2}
        >
          <div className="ac-header">
            <span className="ac-name">Negotiate pacts</span>
            <span className={`ac-cost${ap < 2 ? ' cant-afford' : ''}`}>2 AP</span>
          </div>
          <span className="ac-desc">Propose ward-by-ward pacts — stand down or endorse.</span>
        </button>
        {showAllianceConfig && ap >= 2 && (
          <div className="ac-config">
            <div className="alliance-tabs">
              <button type="button" className={`alliance-tab${allianceMode === 'theyForMe' ? ' is-active' : ''}`} onClick={() => setAllianceMode('theyForMe')}>Mutual pact</button>
              <button type="button" className={`alliance-tab${allianceMode === 'iForThem' ? ' is-active' : ''}`} onClick={() => setAllianceMode('iForThem')}>Stand down for them</button>
            </div>

            {allianceMode === 'theyForMe' && (() => {
              const ally = world.parties.find((p) => p.id === alliancePartyId)
              const allSuggs = alliancePartyId ? suggestPacts(world, alliancePartyId, 0, Math.max(1, checkedPairs.size)) : []
              const suggs = focusWardId
                ? allSuggs.filter((s) => s.theirWardId === focusWardId)
                : allSuggs

              const acceptCount = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept).length
              const allCheckedCount = checkedPairs.size

              return (
                <>
                  <select value={alliancePartyId} onChange={(e) => { setAlliancePartyId(e.target.value); setCheckedPairs(new Set()) }} className="ac-select">
                    <option value="">Pick an ally...</option>
                    {opponents.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>

                  {alliancePartyId && ally && (
                    <div className="negotiation-card">
                      <div className="neg-header">
                        For <strong style={{ color: ally.colour }}>{ally.name}</strong> to stand down in{' '}
                        <strong>{focusWard?.name ?? 'selected ward'}</strong>, you'd need to stand down in:
                      </div>

                      {!focusWardId ? (
                        <span className="alliance-no-suggestions">Click a ward on the map first.</span>
                      ) : suggs.length === 0 ? (
                        <div className="neg-no-deal">
                          No deal — {ally.name} won't stand down in {focusWard?.name}.{' '}
                          {allSuggs.filter((s) => s.theirWardId === focusWardId).length === 0 && allSuggs.filter((s) => s.ourWardId === focusWardId).length > 0
                            ? 'Try the "Stand down for them" tab instead — they might accept if you stand down here.'
                            : ''}
                        </div>
                      ) : (
                        <>
                          <div className="neg-list">
                            {suggs.map((s) => {
                              const key = `${s.ourWardId}|${s.theirWardId}`
                              const isChecked = checkedPairs.has(key)
                              const ourBoost = s.ourWardPlayerShare * 0.01 * 25
                              return (
                                <div
                                  key={key}
                                  className={`neg-row${isChecked ? ' is-checked' : ''}${s.willAccept ? '' : ' is-rejected'}`}
                                  onClick={() => setPairChecked(key, !isChecked)}
                                >
                                  <span className="neg-chk" onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" checked={isChecked} onChange={() => setPairChecked(key, !isChecked)} />
                                  </span>
                                  <span className="neg-ward">{s.ourWardName}</span>
                                  <span className="neg-share">{s.ourWardPlayerShare.toFixed(1)}%</span>
                                  <span className="neg-gain">~+{ourBoost.toFixed(1)}% for them</span>
                                  <span className={`neg-accept${s.willAccept ? '' : ' is-reject'}`}>
                                    {s.willAccept ? `\u2713 ${s.acceptanceChance}%` : `\u2717 ${s.acceptanceChance}%`}
                                  </span>
                                </div>
                              )
                            })}
                          </div>

                          {allCheckedCount > 0 && (
                            <div className="neg-summary">
                              {acceptCount > 0 ? (
                                <>
                                  <span style={{ color: '#1a5c2a', fontWeight: 700 }}>{acceptCount} of {allCheckedCount} will accept</span>
                                  <button className="ink-button small" type="button" onClick={() => {
                                    const accepted = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept)
                                    if (accepted.length === 0) return
                                    const f = accepted[0]
                                    const rest = accepted.slice(1).map((s) => ({ ourWardId: s.ourWardId, theirWardId: s.theirWardId }))
                                    onAction({ type: 'propose_alliance', label: `Alliance with ${ally.name}`, description: `Pact covering ${accepted.length} ward${accepted.length !== 1 ? 's' : ''}`, apCost: 2, targetPartyId: ally.id, wardId: f.ourWardId, allyWardId: f.theirWardId, allianceEntries: rest })
                                    setShowAllianceConfig(false); setAlliancePartyId(''); setCheckedPairs(new Set())
                                  }}>Propose {acceptCount} deal{acceptCount !== 1 ? 's' : ''} (2 AP)</button>
                                </>
                              ) : (
                                <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>NO DEAL — none of {allCheckedCount} will accept</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      <button className="ink-button secondary small" type="button" onClick={() => { setAlliancePartyId(''); setCheckedPairs(new Set()) }}>Back</button>
                    </div>
                  )}
                </>
              )
            })()}

            {allianceMode === 'iForThem' && (() => {
              const ally = world.parties.find((p) => p.id === alliancePartyId)
              const allSuggs = alliancePartyId ? suggestPacts(world, alliancePartyId, 0, Math.max(1, checkedPairs.size)) : []
              const suggs = focusWardId
                ? allSuggs.filter((s) => s.ourWardId === focusWardId)
                : allSuggs

              const acceptCount = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept).length
              const allCheckedCount = checkedPairs.size

              return (
                <>
                  <select value={alliancePartyId} onChange={(e) => { setAlliancePartyId(e.target.value); setCheckedPairs(new Set()) }} className="ac-select">
                    <option value="">Pick an ally...</option>
                    {opponents.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>

                  {alliancePartyId && ally && (
                    <div className="negotiation-card">
                      <div className="neg-header">
                        If you stand down in <strong>{focusWard?.name ?? 'selected ward'}</strong>,{' '}
                        <strong style={{ color: ally.colour }}>{ally.name}</strong> could reciprocate in:
                      </div>

                      {!focusWardId ? (
                        <span className="alliance-no-suggestions">Click a ward on the map first.</span>
                      ) : suggs.length === 0 ? (
                        <div className="neg-no-deal">
                          No deal — standing down in {focusWard?.name} won't persuade {ally.name} to reciprocate.
                        </div>
                      ) : (
                        <>
                          <div className="neg-list">
                            {suggs.map((s) => {
                              const key = `${s.ourWardId}|${s.theirWardId}`
                              const isChecked = checkedPairs.has(key)
                              const theirBoost = s.theirWardAllyShare * 0.01 * 25
                              return (
                                <div
                                  key={key}
                                  className={`neg-row${isChecked ? ' is-checked' : ''}${s.willAccept ? '' : ' is-rejected'}`}
                                  onClick={() => setPairChecked(key, !isChecked)}
                                >
                                  <span className="neg-chk" onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" checked={isChecked} onChange={() => setPairChecked(key, !isChecked)} />
                                  </span>
                                  <span className="neg-ward">{s.theirWardName}</span>
                                  <span className="neg-share">{s.theirWardAllyShare.toFixed(1)}%</span>
                                  <span className="neg-gain">~+{theirBoost.toFixed(1)}% for you</span>
                                  <span className={`neg-accept${s.willAccept ? '' : ' is-reject'}`}>
                                    {s.willAccept ? `\u2713 ${s.acceptanceChance}%` : `\u2717 ${s.acceptanceChance}%`}
                                  </span>
                                </div>
                              )
                            })}
                          </div>

                          {allCheckedCount > 0 && (
                            <div className="neg-summary">
                              <span style={{ color: '#1a5c2a', fontWeight: 700 }}>{acceptCount} of {allCheckedCount} will accept</span>
                              {acceptCount > 0 && (
                                <button className="ink-button small" type="button" onClick={() => {
                                  const accepted = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept)
                                  if (accepted.length === 0) return
                                  const f = accepted[0]
                                  const rest = accepted.slice(1).map((s) => ({ ourWardId: s.ourWardId, theirWardId: s.theirWardId }))
                                  onAction({ type: 'propose_alliance', label: `Alliance with ${ally.name}`, description: `Pact covering ${accepted.length} ward${accepted.length !== 1 ? 's' : ''}`, apCost: 2, targetPartyId: ally.id, wardId: f.ourWardId, allyWardId: f.theirWardId, allianceEntries: rest })
                                  setShowAllianceConfig(false); setAlliancePartyId(''); setCheckedPairs(new Set())
                                }}>Propose {acceptCount} deal{acceptCount !== 1 ? 's' : ''} (2 AP)</button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      <button className="ink-button secondary small" type="button" onClick={() => { setAlliancePartyId(''); setCheckedPairs(new Set()) }}>Back</button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {world.actionsThisWeek.length > 0 && (
        <div className="week-actions-log">
          <div className="log-label">Done this week</div>
          {world.actionsThisWeek.map((a, i) => (
            <div key={i} className={`log-entry log-${a.outcome}`}>
              {a.outcome === 'success' ? '\u2713' : a.outcome === 'backfire' ? '\u2717' : '~'} {a.description}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
