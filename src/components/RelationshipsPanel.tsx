import { useState } from 'react'
import type { PoliticianActionResult } from '../lib/sim'
import type { World } from '../types/sim'

export function RelationshipsPanel({ world, onRelationshipAction, lastResult }: {
  world: World
  onRelationshipAction: (councillorId: string, action: 'reach_out' | 'antagonise') => void
  lastResult: PoliticianActionResult | null
}) {
  const pm = world.politicianMode
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (!pm) return null

  const pol = pm.politician
  const sorted = [...pol.relationships].sort((a, b) => b.strength - a.strength)

  const visible = showAll ? sorted : sorted.slice(0, 4)

  return (
    <div className="relationships-panel">
      {sorted.length > 0 && !showAll && (
        <p className="rel-summary">{sorted.filter((rel) => rel.type === 'ally').length} allies · {sorted.filter((rel) => rel.type === 'rival').length} rivals · showing closest contacts</p>
      )}
      <div className="rel-grid">
        {visible.map((rel) => {
          const isExpanded = expandedId === rel.targetId
          return (
            <div key={rel.targetId} className={`rel-card ${rel.type}`}>
              <button type="button" className="rel-card-toggle" onClick={() => setExpandedId(isExpanded ? null : rel.targetId)}>
              <span className="rel-card-header">
                <span>
                  <span className="rel-name">{rel.targetName}</span>
                  <span className="rel-party-name"><i style={{ background: rel.partyColour }} />{world.parties.find((party) => party.id === rel.partyId)?.name ?? 'Independent'}</span>
                </span>
              </span>
              <span className="rel-strength-bar">
                <span
                  className={`rel-strength-fill${rel.strength >= 0 ? ' positive' : ' negative'}`}
                  style={{ width: `${Math.abs(rel.strength)}%` }}
                />
              </span>
              <span className="rel-meta">
                <span className="rel-type-badge">{rel.type}</span>
                <span className="rel-strength-num">{rel.strength > 0 ? '+' : ''}{rel.strength}</span>
              </span>
              {isExpanded && rel.history.length > 0 && (
                <span className="rel-history">
                  {rel.history.slice(-4).map((h, i) => (
                    <span key={i} className="rel-history-item">{h}</span>
                  ))}
                </span>
              )}
              </button>
              {isExpanded && (
                <div className="rel-actions">
                  <button type="button" disabled={world.playerActionPoints < 1} onClick={() => onRelationshipAction(rel.targetId, 'reach_out')}>Reach out · 1 AP</button>
                  <button type="button" className="rel-antagonise" onClick={() => onRelationshipAction(rel.targetId, 'antagonise')}>Antagonise</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {sorted.length > 4 && (
        <button type="button" className="rel-show-all" onClick={() => setShowAll((current) => !current)}>
          {showAll ? 'Show key contacts' : `Show all ${sorted.length} contacts`}
        </button>
      )}
      {lastResult?.action.type === 'lobby_councillor' && (
        <p className={`rel-action-result ${lastResult.outcome}`}>{lastResult.description}</p>
      )}
    </div>
  )
}
