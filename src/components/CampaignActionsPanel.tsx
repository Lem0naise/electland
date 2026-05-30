import { useEffect, useState } from 'react'
import { getAvailableActions } from '../lib/sim'
import type { ActiveCampaign, CampaignAction, World } from '../types/sim'

export function CampaignActionsPanel({ world, selectedWardId, onAction, onTogglePermanent }: {
  world: World
  selectedWardId: string
  onAction: (action: CampaignAction) => void
  onTogglePermanent: (campaign: ActiveCampaign) => void
}) {
  const [focusWardId, setFocusWardId] = useState(selectedWardId)
  const [smearTargetId, setSmearTargetId] = useState('')
  const [policyAxis, setPolicyAxis] = useState<'change' | 'growth' | 'services'>('change')
  const [policyDir, setPolicyDir] = useState<1 | -1>(1)
  const [showSmearConfig, setShowSmearConfig] = useState(false)
  const [showPolicyConfig, setShowPolicyConfig] = useState(false)
  const [showAllianceConfig, setShowAllianceConfig] = useState(false)
  const [alliancePartyId, setAlliancePartyId] = useState('')
  const [allianceOurWardId, setAllianceOurWardId] = useState('')
  const [allianceTheirWardId, setAllianceTheirWardId] = useState('')

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
            {world.activeCampaigns.length} auto-campaign{world.activeCampaigns.length !== 1 ? 's' : ''} running — draining {Math.min(3, totalPermanentDrain)} AP/week
          </span>
        </div>
      )}

      {/* Active alliance pacts */}
      {world.alliancePacts.filter((p) => !p.broken).length > 0 && (
        <div className="alliance-pacts-display">
          {world.alliancePacts.filter((p) => !p.broken).map((pact) => {
            const isInitiator = pact.initiatorPartyId === world.playerPartyId
            const ourWard = world.constituencies.find((c) => c.id === (isInitiator ? pact.standingDownIn : pact.allyStandsDownIn))
            const theirWard = world.constituencies.find((c) => c.id === (isInitiator ? pact.allyStandsDownIn : pact.standingDownIn))
            const allyId = isInitiator ? pact.allyPartyId : pact.initiatorPartyId
            const ally = world.parties.find((p) => p.id === allyId)
            return (
              <div key={pact.id} className="alliance-pact-row">
                <span className="alliance-pact-indicator">{'\uD83E\uDD1D'}</span>
                <span className="alliance-pact-text">
                  Pact with <strong>{ally?.name ?? allyId}</strong>: you stand down in {ourWard?.name ?? '?'}, they in {theirWard?.name ?? '?'}
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
                      title={isPermanentActive ? 'Stop automated action' : 'Run automatically each week (1 AP/week)'}
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
                      title={isPermanentActive ? 'Stop automated action' : 'Run automatically each week (1 AP/week)'}
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
          <span className="ac-desc">Negotiate a pact — stand down in one ward, they stand down in another.</span>
        </button>
        {showAllianceConfig && ap >= 2 && (
          <div className="ac-config">
            <select
              value={alliancePartyId}
              onChange={(e) => setAlliancePartyId(e.target.value)}
              className="ac-select"
            >
              <option value="">Pick an ally...</option>
              {opponents
                .filter((o) => !world.alliancePacts.some((p) => !p.broken &&
                  ((p.initiatorPartyId === world.playerPartyId && p.allyPartyId === o.id) ||
                   (p.allyPartyId === world.playerPartyId && p.initiatorPartyId === o.id))))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
            <select
              value={allianceOurWardId}
              onChange={(e) => setAllianceOurWardId(e.target.value)}
              className="ac-select"
            >
              <option value="">We stand down in...</option>
              {world.constituencies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={allianceTheirWardId}
              onChange={(e) => setAllianceTheirWardId(e.target.value)}
              className="ac-select"
            >
              <option value="">They stand down in...</option>
              {world.constituencies
                .filter((c) => c.id !== allianceOurWardId)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <button
              className="ink-button small"
              type="button"
              disabled={!alliancePartyId || !allianceOurWardId || !allianceTheirWardId}
              onClick={() => {
                const ally = world.parties.find((p) => p.id === alliancePartyId)
                const ourWard = world.constituencies.find((c) => c.id === allianceOurWardId)
                const theirWard = world.constituencies.find((c) => c.id === allianceTheirWardId)
                if (!ally || !ourWard || !theirWard) return
                onAction({
                  type: 'propose_alliance',
                  label: `Alliance with ${ally.name}`,
                  description: `Stand down in ${ourWard.name}; they stand down in ${theirWard.name}`,
                  apCost: 2,
                  targetPartyId: ally.id,
                  wardId: ourWard.id,
                  allyWardId: theirWard.id,
                })
                setShowAllianceConfig(false)
                setAlliancePartyId('')
                setAllianceOurWardId('')
                setAllianceTheirWardId('')
              }}
            >
              Propose pact
            </button>
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
