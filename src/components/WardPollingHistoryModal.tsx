import { useEffect } from 'react'
import { PartyShareLineChart } from './charts/PartyShareLineChart'
import { wardHistoryDatasets } from '../lib/campaignHistory'
import type { Constituency, World } from '../types/sim'

export function WardPollingHistoryModal({
  world,
  constituency,
  onClose,
}: {
  world: World
  constituency: Constituency
  onClose: () => void
}) {
  const { labels, datasets, history, boundaryWeeks } = wardHistoryDatasets(world, constituency)
  const boundaryLabelIndices = boundaryWeeks
    .map((week) => history.findIndex((entry) => entry.week === week))
    .filter((i) => i >= 0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ward-history-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ward-history-title">
        <div className="modal-header">
          <span className="modal-kicker">Ward polling</span>
          <h2 id="ward-history-title">{constituency.name} — polling history</h2>
          <p className="modal-sub">Vote share by week across up to three election cycles. Highlighted lines are your party and the sitting incumbent where known. ★ marks an election.</p>
        </div>
        {history.length < 2 ? (
          <p className="history-empty">Advance a few weeks to see trends.</p>
        ) : (
          <PartyShareLineChart labels={labels} datasets={datasets} height={300} boundaryLabelIndices={boundaryLabelIndices} />
        )}
        <p className="ward-history-footer">
          {constituency.leadingPartyName} leads by {constituency.margin.toFixed(1)} points now.
        </p>
        <button type="button" className="ink-button secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
