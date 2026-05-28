import { useEffect } from 'react'
import type { ActionResult } from '../types/sim'

function formatSigned(value: number, digits = 1) {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`
}

export function ActionFlash({ result, onDismiss }: { result: ActionResult; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3200)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className={`action-flash action-flash-${result.outcome}`} onClick={onDismiss}>
      <div className="flash-outcome-icon">
        {result.outcome === 'success' ? '\u2713' : result.outcome === 'backfire' ? '\u2717' : '~'}
      </div>
      <div className="flash-body">
        <strong>{result.outcome === 'success' ? 'Success' : result.outcome === 'backfire' ? 'Backfired!' : 'Neutral'}</strong>
        <span>{result.description}</span>
        {result.voteShareDelta !== undefined && Math.abs(result.voteShareDelta) > 0.1 && (
          <span className={`flash-delta${result.voteShareDelta > 0 ? ' positive' : ' negative'}`}>
            {formatSigned(result.voteShareDelta, 1)}pp in {result.wardName ?? 'affected wards'}
          </span>
        )}
      </div>
    </div>
  )
}
