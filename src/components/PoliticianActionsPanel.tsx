import { useState } from 'react'
import { getPoliticianActionsByCategory } from '../lib/sim'
import { formatAxis } from '../lib/format'
import type { PoliticianActionResult } from '../lib/sim'
import type { PoliticalValueKey, PoliticianActionMeta, PoliticianActionType, World } from '../types/sim'

export function PoliticianActionsPanel({ world, onAction, onToggleAuto, lastResult }: {
  world: World
  onAction: (action: PoliticianActionMeta) => void
  onToggleAuto: (type: PoliticianActionType) => void
  lastResult: PoliticianActionResult | null
}) {
  const pm = world.politicianMode
  const [policyAxis, setPolicyAxis] = useState<PoliticalValueKey>('change')
  const [policyDirection, setPolicyDirection] = useState<1 | -1>(1)
  if (!pm) return null

  const groups = getPoliticianActionsByCategory(world)
  const actionAvailable = world.playerActionPoints >= 1
  const pol = pm.politician
  const weekly = pm.autoCampaigns[0]

  const categoryAccent: Record<string, string> = {
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
          <span className="pol-stat-label">Reputation</span>
          <span className="pol-stat-value">{pol.reputation}</span>
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
        {weekly && (
          <span className="pol-auto-indicator">
            Weekly auto: {weekly.replace(/_/g, ' ')}
            {actionAvailable ? ' (runs if you skip acting before advancing)' : ' (skipped — you already acted)'}
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
              const isPolicyAction = action.type === 'shift_personal_policy'
              const canSetPolicy = canAfford && world.week >= pol.personalPolicyNextWeek
              return (
                <div
                  key={action.type}
                  className={`pol-action-card${!canAfford ? ' disabled' : ''}${isAuto ? ' is-auto' : ''}`}
                  onClick={() => {
                    if (!isPolicyAction && canAfford) onAction(action)
                  }}
                >
                  <div className="pol-action-top">
                    <button
                      type="button"
                      className="pol-action-fire"
                      disabled={isPolicyAction ? !canSetPolicy : !canAfford}
                      onClick={(event) => {
                        event.stopPropagation()
                        onAction(isPolicyAction ? { ...action, policyAxis, policyDirection } : action)
                      }}
                    >
                      <span className="pol-action-name">{action.label}</span>
                      <span className="pol-action-cost">Uses weekly action</span>
                    </button>
                    {!isPolicyAction && (
                      <label className="pol-auto-toggle" title="Run automatically at week end if you have not acted" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isAuto}
                          onChange={() => onToggleAuto(action.type)}
                        />
                        <span className="auto-label">Weekly</span>
                      </label>
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
                          <option value="change">Reform · {formatAxis(pol.personalValues.change)}</option>
                          <option value="growth">Business · {formatAxis(pol.personalValues.growth)}</option>
                          <option value="services">Services · {formatAxis(pol.personalValues.services)}</option>
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
            {lastResult.reputationDelta != null && lastResult.reputationDelta !== 0 && (
              <span className={lastResult.reputationDelta > 0 ? 'delta-pos' : 'delta-neg'}>
                Rep {lastResult.reputationDelta > 0 ? '+' : ''}{lastResult.reputationDelta}
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
