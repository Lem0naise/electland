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
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())
  const [filterOurWardId, setFilterOurWardId] = useState('')
  const [filterTheirWardId, setFilterTheirWardId] = useState('')

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
        id: `${action.type}-${action.wardId}-${Date.now()}`,
        type: action.type,
        label: action.label,
        apCostPerTurn: action.permanentApCost ?? 1,
        wardId: action.wardId,
      }
      onTogglePermanent(newCampaign)
    }
  }

  const hasEvent = world.weeklyEvent && !world.weeklyEvent.resolved

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
            {' '}— draining {Math.min(3, totalPermanentDrain)}/5 AP weekly
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
      {world.pendingNpcProposal && !world.pendingNpcProposal.broken && (
        <div className="npc-proposal-prompt">
          <div className="npc-proposal-header">
            <span className="npc-proposal-icon">{'\uD83E\uDD1D'}</span>
            <span>
              <strong>{world.parties.find((p) => p.id === world.pendingNpcProposal!.initiatorPartyId)?.name ?? '?'}</strong>
              {' '}proposes a pact with you
            </span>
          </div>
          <div className="npc-proposal-details">
            {(() => {
              const p = world.pendingNpcProposal!
              const theirWard = world.constituencies.find((c) => c.id === p.standingDownIn)
              const ourWard = world.constituencies.find((c) => c.id === p.allyStandsDownIn)
              return (
                <span>
                  They stand down in <em>{theirWard?.name ?? '?'}</em>
                  {' ⇄ '}
                  You stand down in <em>{ourWard?.name ?? '?'}</em>
                  {' '}
                  <span className="alliance-boost">
                    (+{(p.playerEndorsementValue * 0.01).toFixed(2)} from their endorsement)
                  </span>
                </span>
              )
            })()}
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
            >
              {'\u2717'} Reject
            </button>
          </div>
        </div>
      )}

      {/* Active alliance pacts */}
      {world.alliancePacts.filter((p) => !p.broken).length > 0 && (
        <div className="alliance-pacts-display">
          {world.alliancePacts.filter((p) => !p.broken).map((pact) => {
            const playerIsInitiator = pact.initiatorPartyId === world.playerPartyId
            const playerIsAlly = pact.allyPartyId === world.playerPartyId
            const playerInvolved = playerIsInitiator || playerIsAlly

            if (playerInvolved) {
              const ourWard = world.constituencies.find((c) => c.id === (playerIsInitiator ? pact.standingDownIn : pact.allyStandsDownIn))
              const theirWard = world.constituencies.find((c) => c.id === (playerIsInitiator ? pact.allyStandsDownIn : pact.standingDownIn))
              const allyId = playerIsInitiator ? pact.allyPartyId : pact.initiatorPartyId
              const ally = world.parties.find((p) => p.id === allyId)
              return (
                <div key={pact.id} className="alliance-pact-row">
                  <span className="alliance-pact-indicator">{'\uD83E\uDD1D'}</span>
                  <span className="alliance-pact-text">
                    Pact with <strong>{ally?.name ?? allyId}</strong>: you stand down in {ourWard?.name ?? '?'}, they in {theirWard?.name ?? '?'}
                    <br />
                    <span className="alliance-boost">
                      You gain +{(pact.playerEndorsementValue * 0.01).toFixed(2)} in {theirWard?.name ?? '?'}{' '}
                      · They gain +{(pact.allyEndorsementValue * 0.01).toFixed(2)} in {ourWard?.name ?? '?'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="alliance-break-btn"
                    onClick={() => onAction({
                      type: 'break_alliance',
                      label: `Break pact with ${ally?.name ?? allyId}`,
                      description: '',
                      apCost: 0,
                      targetPartyId: allyId,
                      wardId: pact.id,
                    })}
                    title="Break this pact"
                  >
                    {'\u2715'}
                  </button>
                </div>
              )
            }

            // NPC-only pact
            const initiator = world.parties.find((p) => p.id === pact.initiatorPartyId)
            const ally = world.parties.find((p) => p.id === pact.allyPartyId)
            const initWard = world.constituencies.find((c) => c.id === pact.standingDownIn)
            const allyWard = world.constituencies.find((c) => c.id === pact.allyStandsDownIn)
            return (
              <div key={pact.id} className="alliance-pact-row is-npc">
                <span className="alliance-pact-indicator">{'\uD83E\uDD1D'}</span>
                <span className="alliance-pact-text">
                  <strong>{initiator?.name ?? pact.initiatorPartyId}</strong> ↔ <strong>{ally?.name ?? pact.allyPartyId}</strong>:{' '}
                  {initiator?.name ?? '?'} stands down in {initWard?.name ?? '?'}, {ally?.name ?? '?'} in {allyWard?.name ?? '?'}
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
            <span className="ac-name">Propose alliance</span>
            <span className={`ac-cost${ap < 2 ? ' cant-afford' : ''}`}>2 AP</span>
          </div>
          <span className="ac-desc">Negotiate pacts — stand down in wards, they stand down in yours.</span>
        </button>
        {showAllianceConfig && ap >= 2 && (
          <div className="ac-config">
            <select
              value={alliancePartyId}
              onChange={(e) => {
                setAlliancePartyId(e.target.value)
                setSelectedSuggestions(new Set())
                setFilterOurWardId('')
                setFilterTheirWardId('')
              }}
              className="ac-select"
            >
              <option value="">Pick an ally...</option>
              {opponents.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {alliancePartyId && (() => {
              const suggestions = suggestPacts(world, alliancePartyId)
              const ally = world.parties.find((p) => p.id === alliancePartyId)
              if (suggestions.length === 0) {
                return <span className="alliance-no-suggestions">No promising pacts found with {ally?.name ?? 'this party'}.</span>
              }
              return (
                <div className="alliance-suggestions">
                  <div className="alliance-suggestions-label">
                    Suggested pacts with {ally?.name ?? '?'}:
                  </div>

                  <div className="alliance-filters">
                    <select
                      value={filterOurWardId}
                      onChange={(e) => {
                        setFilterOurWardId(e.target.value)
                        setFilterTheirWardId('')
                      }}
                      className="ac-select alliance-filter-select"
                    >
                      <option value="">Filter: my stand-down ward...</option>
                      {world.constituencies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={filterTheirWardId}
                      onChange={(e) => {
                        setFilterTheirWardId(e.target.value)
                        setFilterOurWardId('')
                      }}
                      className="ac-select alliance-filter-select"
                    >
                      <option value="">Filter: their stand-down ward...</option>
                      {world.constituencies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const filtered = suggestions
                      .filter((s) => !filterOurWardId || s.ourWardId === filterOurWardId)
                      .filter((s) => !filterTheirWardId || s.theirWardId === filterTheirWardId)
                      .slice(0, 12)
                    return filtered.map((s) => {
                      const i = suggestions.indexOf(s)
                      const isSelected = selectedSuggestions.has(i)
                    return (
                      <label key={i} className={`alliance-suggestion-row${isSelected ? ' is-selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedSuggestions((prev) => {
                              const next = new Set(prev)
                              if (next.has(i)) { next.delete(i) } else { next.add(i) }
                              return next
                            })
                          }}
                        />
                        <span className="alliance-suggestion-text">
                          <strong>You</strong> stand down in <em>{s.ourWardName}</em> ({s.ourWardPlayerShare.toFixed(1)}%)
                          {' ⇄ '}
                          <strong>They</strong> stand down in <em>{s.theirWardName}</em> ({s.theirWardAllyShare.toFixed(1)}%)
                        </span>
                        <span className="alliance-suggestion-meta">
                          <span className={`alliance-accept-chance${s.acceptanceChance >= 70 ? ' is-high' : s.acceptanceChance >= 35 ? ' is-mid' : ' is-low'}`}>
                            {s.acceptanceChance}% acceptance
                          </span>
                          {s.couldFlip && s.flipDelta && (
                            <span className="alliance-flip-badge">{'\u2B62'} {s.flipDelta}</span>
                          )}
                        </span>
                      </label>
                    )
                    })
                  })()}

                  <button
                    className="ink-button small alliance-batch-btn"
                    type="button"
                    disabled={selectedSuggestions.size === 0}
                    onClick={() => {
                      const ally = world.parties.find((p) => p.id === alliancePartyId)
                      if (!ally) return
                      const batchWards: Array<{ ourWardId: string; theirWardId: string }> = []
                      for (const idx of selectedSuggestions) {
                        const s = suggestions[idx]
                        batchWards.push({ ourWardId: s.ourWardId, theirWardId: s.theirWardId })
                      }
                      const first = batchWards[0]
                      onAction({
                        type: 'propose_alliance',
                        label: `Alliance with ${ally.name}`,
                        description: `Stand down in ${batchWards.length} ward${batchWards.length !== 1 ? 's' : ''}; they stand down in ${batchWards.length}`,
                        apCost: 2,
                        targetPartyId: ally.id,
                        wardId: first.ourWardId,
                        allyWardId: first.theirWardId,
                        allianceBatchWards: batchWards.slice(1),
                      })
                      setShowAllianceConfig(false)
                      setAlliancePartyId('')
                      setSelectedSuggestions(new Set())
                      setFilterOurWardId('')
                      setFilterTheirWardId('')
                    }}
                  >
                    Propose {selectedSuggestions.size} pact{selectedSuggestions.size !== 1 ? 's' : ''} (2 AP total)
                  </button>
                </div>
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
