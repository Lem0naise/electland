import { useState } from 'react'
import type { Constituency, World } from '../types/sim'
import { summariseTacticalVoting } from '../lib/sim'
import { WardCandidateBars } from './WardCandidateBars'
import { WardPollingHistoryModal } from './WardPollingHistoryModal'

export function CurrentPollingPanel({ world, constituency }: { world: World; constituency?: Constituency }) {
  const [showHistory, setShowHistory] = useState(false)

  if (!constituency) {
    return (
      <section className="panel current-polling-panel">
        <div className="panel-kicker">Current polling</div>
        <p>Select a ward on the map to view its candidates and polling.</p>
      </section>
    )
  }

  const leadingResult = constituency.results[0]
  const playerWard = world.politicianMode?.politician.wardId === constituency.id
  const hasHistory = constituency.history.length > 0
  const tactical = summariseTacticalVoting(constituency)

  return (
    <section className="panel current-polling-panel">
      <div className="polling-panel-header">
        <div>
          <div className="panel-kicker">Current polling</div>
          <h3>{constituency.name}</h3>
        </div>
        <div className="polling-panel-actions">
          <button
            type="button"
            className="polling-history-btn"
            disabled={!hasHistory}
            title={hasHistory ? 'View polling since the last election' : 'No history yet — advance a few weeks'}
            onClick={() => setShowHistory(true)}
          >
            History
          </button>
          {playerWard && <span className="your-ward-badge">YOUR WARD</span>}
        </div>
      </div>
      <WardCandidateBars world={world} constituency={constituency} />
      {leadingResult && <p className="current-polling-summary">{leadingResult.partyName} leads by {constituency.margin.toFixed(1)} points.</p>}
      <div className="current-polling-tactical">
        <span className="current-polling-tactical-label">Tactical voting</span>
        {tactical.active ? (
          <>
            {tactical.race.length >= 2 && (
              <p><strong>Race:</strong> {tactical.race.join(', ')}</p>
            )}
            {tactical.squeezed.length > 0 && (
              <p><strong>Squeezed:</strong> {tactical.squeezed.join(', ')}</p>
            )}
            {tactical.breakingThrough.length > 0 && (
              <p><strong>Breaking through:</strong> {tactical.breakingThrough.join(', ')}</p>
            )}
          </>
        ) : (
          <p>Not much tactical voting here.</p>
        )}
      </div>
      {showHistory && (
        <WardPollingHistoryModal
          world={world}
          constituency={constituency}
          onClose={() => setShowHistory(false)}
        />
      )}
    </section>
  )
}
