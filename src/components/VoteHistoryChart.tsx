import { memo } from 'react'
import type { PartyPerformance, VoteHistoryEntry, World } from '../types/sim'

export const VoteHistoryChart = memo(function VoteHistoryChart({ world, tall = false }: { world: World; tall?: boolean }) {
  const history = world.voteHistory
  if (history.length < 2) {
    return <div className="history-empty">Advance a few weeks to see vote trends.</div>
  }

  const width = 560
  const height = tall ? 180 : 100
  const padL = 28
  const padR = tall ? 40 : 8
  const padT = 6
  const padB = 16
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  const weeks = history.map((h: VoteHistoryEntry) => h.week)
  const minWeek = Math.min(...weeks)
  const maxWeek = Math.max(...weeks)

  const topParties = world.nationalResults

  const allShares = history.flatMap((h: VoteHistoryEntry) =>
    topParties.map((p: PartyPerformance) => h.partyShares[p.partyId] ?? 0),
  )
  const rawMax = Math.max(...allShares, 5)
  const yMax = Math.ceil(rawMax / 10) * 10

  const gridlines = yMax <= 30
    ? [Math.round(yMax / 2), yMax]
    : yMax <= 60
      ? [Math.round(yMax / 3), Math.round((yMax * 2) / 3), yMax]
      : [25, 50, yMax]

  function x(week: number) {
    if (maxWeek === minWeek) return padL + chartW / 2
    return padL + ((week - minWeek) / (maxWeek - minWeek)) * chartW
  }

  function y(share: number) {
    return padT + chartH - (share / yMax) * chartH
  }

  return (
    <div className="history-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className={`history-svg${tall ? ' tall' : ''}`}>
        <title>Vote share history</title>
        <desc>Sparkline chart showing party vote share trends over time</desc>
        {gridlines.map((pct) => (
          <g key={pct}>
            <line x1={padL} x2={padL + chartW} y1={y(pct)} y2={y(pct)} className="chart-gridline" />
            <text x={padL - 4} y={y(pct) + 3} className="chart-axis-label" textAnchor="end">{pct}</text>
          </g>
        ))}
        <line x1={padL} x2={padL + chartW} y1={y(0)} y2={y(0)} className="chart-gridline" strokeOpacity={0.4} />

        {topParties.map((party: PartyPerformance) => {
          const points = history
            .map((h: VoteHistoryEntry) => ({ week: h.week, share: h.partyShares[party.partyId] ?? 0 }))
            .filter((p) => p.share > 0)
          if (points.length < 2) return null
          const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.week).toFixed(1)} ${y(p.share).toFixed(1)}`).join(' ')
          const last = points[points.length - 1]
          const isPlayer = party.partyId === world.playerPartyId
          return (
            <g key={party.partyId}>
              <path d={d} fill="none" stroke={party.colour} strokeWidth={isPlayer ? 2.4 : 1.4} strokeOpacity={isPlayer ? 0.95 : 0.7} />
              <circle cx={x(last.week)} cy={y(last.share)} r={isPlayer ? 3.5 : 2.5} fill={party.colour} />
              <text
                x={x(last.week) + 5}
                y={y(last.share) + 3}
                className="chart-axis-label"
                style={{ fontSize: 8, fill: party.colour, fontWeight: isPlayer ? 700 : 400 }}
              >
                {last.share.toFixed(0)}%
              </text>
            </g>
          )
        })}
      </svg>

      <div className="chart-legend">
        {topParties.map((p: PartyPerformance) => (
          <span key={p.partyId} className={`legend-item${p.partyId === world.playerPartyId ? ' is-player' : ''}`}>
            <span className="legend-swatch" style={{ background: p.colour }} />
            {p.partyName}
          </span>
        ))}
      </div>
    </div>
  )
})
