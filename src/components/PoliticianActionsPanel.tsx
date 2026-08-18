import { useMemo, useState } from 'react'
import { getColleagueCampaignTargets, getPoliticianActionsByCategory } from '../lib/sim'
import { formatAxis } from '../lib/format'
import type { PoliticianActionResult } from '../lib/sim'
import type { PoliticalValueKey, PoliticianActionMeta, PoliticianActionType, World } from '../types/sim'

export function PoliticianActionsPanel({ world, onAction, onToggleAuto, onSetColleagueTarget, lastResult }: {
  world: World
  onAction: (action: PoliticianActionMeta) => void
  onToggleAuto: (type: PoliticianActionType) => void
  onSetColleagueTarget: (wardId: string) => void
  lastResult: PoliticianActionResult | null
}) {
  const pm = world.politicianMode
  const [policyAxis, setPolicyAxis] = useState<PoliticalValueKey>('change')
  const [policyDirection, setPolicyDirection] = useState<1 | -1>(1)
  const [colleagueWardId, setColleagueWardId] = useState(pm?.autoColleagueWardId ?? '')
  const [showColleaguePicker, setShowColleaguePicker] = useState(false)
  const colleagueTargets = useMemo(() => (pm ? getColleagueCampaignTargets(world) : []), [pm, world])

  if (!pm) return null

  const groups = getPoliticianActionsByCategory(world)
  const actionAvailable = world.playerActionPoints >= 1
  const pol = pm.politician
  const weekly = pm.autoCampaigns[0]
  const selectedColleague = colleagueTargets.find((entry) => entry.wardId === colleagueWardId)
    ?? colleagueTargets.find((entry) => entry.wardId === pm.autoColleagueWardId)
    ?? colleagueTargets[0]
  const effectiveColleagueWardId = selectedColleague?.wardId ?? ''

  const categoryAccent: Record<string, string> = {
    incumbent: 'cat-political',
    grassroots: 'cat-grassroots',
    communications: 'cat-comms',
    political: 'cat-political',
  }

  return (
    <div className="politician-actions-panel">
      <div className="pol-stats-bar">
        <div className="pol-stat">
          <span className="pol-stat-label" title="Your local personal rating. It strengthens your party's support in your ward, but is not the same as projected vote share.">Personal rating</span>
          <span className={`pol-stat-value${pol.personalApproval >= 0 ? ' positive' : ' negative'}`}>
            {pol.personalApproval >= 0 ? '+' : ''}{(pol.personalApproval * 100).toFixed(0)}
          </span>
        </div>
        <div className="pol-stat">
          <span className="pol-stat-label">Influence</span>
          <span className="pol-stat-value">{pol.influence}</span>
        </div>
        <div className="pol-stat">
          <span className="pol-stat-label">Loyalty</span>
          <span className="pol-stat-value">{pol.partyLoyalty}</span>
        </div>
      </div>

      {pol.traits.length > 0 && (
        <div className="pol-traits-bar">
          {pol.traits.map((t) => (
            <span key={t.id} className="pol-trait-badge" title={t.effect}>{t.label}</span>
          ))}
        </div>
      )}

      <div className="pol-ap-display">
        <strong>{actionAvailable ? 'Action available' : 'Action used'}</strong> this week
        {(weekly && actionAvailable) && (
          <span className="pol-auto-indicator">
            If you do nothing, {weekly.replace(/_/g, ' ')}
            {weekly === 'help_colleague' && selectedColleague ? ` → ${selectedColleague.wardName} ` : ''}
            {' '} will happen automatically
          </span>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.category} className={`pol-action-group ${categoryAccent[group.category] ?? ''}`}>
          <div className="pol-group-header">{group.label}</div>
          <div className="pol-group-actions">
            {group.actions.map((action) => {
              const canAfford = actionAvailable
              const isAuto = weekly === action.type
              const isPersonalPolicy = action.type === 'shift_personal_policy'
              const isPartyPolicy = action.type === 'shift_party_policy'
              const isPolicyAction = isPersonalPolicy || isPartyPolicy
              const isColleagueAction = action.type === 'help_colleague'
              const partyValues = world.parties.find((party) => party.id === pol.partyId)?.values ?? pol.personalValues
              const pickerValues = isPartyPolicy ? partyValues : pol.personalValues
              const canSetPolicy = isPartyPolicy
                ? canAfford && !world.policyShiftUsedThisCycle
                : canAfford && world.week >= pol.personalPolicyNextWeek
              const canFireColleague = canAfford && Boolean(effectiveColleagueWardId)
              const showPicker = isColleagueAction && (showColleaguePicker || !effectiveColleagueWardId)
              return (
                <div
                  key={action.type}
                  className={`pol-action-card${!canAfford && !(isColleagueAction && isAuto) ? ' disabled' : ''}${isAuto ? ' is-auto' : ''}`}
                  onClick={() => {
                    if (isPolicyAction || isColleagueAction) return
                    if (canAfford) onAction(action)
                  }}
                >
                  <div className="pol-action-top">
                    <button
                      type="button"
                      className="pol-action-fire"
                      disabled={isPolicyAction ? !canSetPolicy : isColleagueAction ? !canFireColleague : !canAfford}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (isPolicyAction) {
                          onAction({ ...action, policyAxis, policyDirection })
                          return
                        }
                        if (isColleagueAction) {
                          if (!effectiveColleagueWardId) {
                            setShowColleaguePicker(true)
                            return
                          }
                          onSetColleagueTarget(effectiveColleagueWardId)
                          onAction({ ...action, targetWardId: effectiveColleagueWardId })
                          setShowColleaguePicker(false)
                          return
                        }
                        onAction(action)
                      }}
                    >
                      <span className="pol-action-name">{action.label}</span>
                    </button>
                    {!isPolicyAction && (
                      <button
                        type="button"
                        className={`pol-auto-btn${isAuto ? ' active' : ''}`}
                        title="Run automatically at week end if you have not acted"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (isColleagueAction && !isAuto && effectiveColleagueWardId) {
                            onSetColleagueTarget(effectiveColleagueWardId)
                          }
                          onToggleAuto(action.type)
                        }}
                      >
                        AUTO
                      </button>
                    )}
                  </div>
                  <div className="pol-action-meta">
                    <span className="pol-action-effect">{action.expectedEffect}</span>
                    {action.riskDescription && <span className="pol-action-risk">{action.riskDescription}</span>}
                    {action.traitBonus && <span className="pol-action-trait">{action.traitBonus}</span>}
                  </div>
                  {isPolicyAction && (
                    <div className="personal-policy-config">
                      <label>
                        Axis
                        <select value={policyAxis} onChange={(event) => setPolicyAxis(event.target.value as PoliticalValueKey)} disabled={!canSetPolicy}>
                          <option value="change">Reform · {formatAxis(pickerValues.change)}</option>
                          <option value="growth">Business · {formatAxis(pickerValues.growth)}</option>
                          <option value="services">Services · {formatAxis(pickerValues.services)}</option>
                        </select>
                      </label>
                      <label>
                        Direction
                        <select value={policyDirection} onChange={(event) => setPolicyDirection(Number(event.target.value) as 1 | -1)} disabled={!canSetPolicy}>
                          <option value={1}>Move +10</option>
                          <option value={-1}>Move −10</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {isColleagueAction && (
                    <div className="colleague-campaign-picker" onClick={(event) => event.stopPropagation()}>
                      {selectedColleague && !showPicker ? (
                        <div className="colleague-campaign-selected">
                          <div className="colleague-campaign-summary">
                            <strong>{selectedColleague.candidateName}</strong>
                            <span>{selectedColleague.wardName}</span>
                            <span>{selectedColleague.partyShare.toFixed(0)}% · leader {selectedColleague.leadingPartyName} by {selectedColleague.margin.toFixed(0)}%</span>
                            {selectedColleague.isBattleground && <span className="colleague-battleground">Battleground</span>}
                          </div>
                          <button type="button" className="colleague-change-target" onClick={() => setShowColleaguePicker(true)}>
                            Change target ward
                          </button>
                        </div>
                      ) : (
                        <div className="colleague-campaign-list">
                          {colleagueTargets.map((target) => (
                            <button
                              key={target.wardId}
                              type="button"
                              className={`colleague-campaign-option${target.wardId === effectiveColleagueWardId ? ' selected' : ''}`}
                              onClick={() => {
                                setColleagueWardId(target.wardId)
                                onSetColleagueTarget(target.wardId)
                                setShowColleaguePicker(false)
                              }}
                            >
                              <span className="colleague-option-main">
                                <strong>{target.wardName}</strong>
                                <span>{target.candidateName}{target.councillorId ? ' · councillor' : ' · candidate'}</span>
                              </span>
                              <span className="colleague-option-meta">
                                {target.partyShare.toFixed(0)}% · {target.leadingPartyName} +{target.margin.toFixed(0)}%
                                {target.isBattleground ? ' · battleground' : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {lastResult && (
        <div className={`pol-result-flash ${lastResult.outcome}`}>
          <p>{lastResult.description}</p>
          <div className="pol-result-deltas">
            {lastResult.approvalDelta != null && lastResult.approvalDelta !== 0 && (
              <span className={lastResult.approvalDelta > 0 ? 'delta-pos' : 'delta-neg'}>
                Approval {lastResult.approvalDelta > 0 ? '+' : ''}{(lastResult.approvalDelta * 100).toFixed(0)}%
              </span>
            )}
            {lastResult.influenceDelta != null && lastResult.influenceDelta !== 0 && (
              <span className={lastResult.influenceDelta > 0 ? 'delta-pos' : 'delta-neg'}>
                Influence {lastResult.influenceDelta > 0 ? '+' : ''}{lastResult.influenceDelta}
              </span>
            )}
            {lastResult.loyaltyDelta != null && lastResult.loyaltyDelta !== 0 && (
              <span className={lastResult.loyaltyDelta > 0 ? 'delta-pos' : 'delta-neg'}>
                Loyalty {lastResult.loyaltyDelta > 0 ? '+' : ''}{lastResult.loyaltyDelta}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
