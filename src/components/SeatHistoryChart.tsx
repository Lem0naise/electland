import { memo } from 'react'
import { Bar } from 'react-chartjs-2'
import { registerCharts } from './charts/registerCharts'
import type { World } from '../types/sim'

registerCharts()

export const SeatHistoryChart = memo(function SeatHistoryChart({ world }: { world: World }) {
  const history = world.electionSeatHistory ?? []
  if (history.length < 1) {
    return <div className="history-empty">Hold an election to see seat totals over time.</div>
  }

  const ink = 'rgba(44, 31, 14, 0.72)'
  const inkSoft = 'rgba(44, 31, 14, 0.45)'
  const grid = 'rgba(44, 31, 14, 0.1)'

  const labels = history.map((entry) => entry.governmentLabel ?? `Election ${entry.electionNumber}`)
  const partyIds = [...new Set(history.flatMap((entry) => Object.keys(entry.partySeats)))]
  const datasets = partyIds.map((partyId) => {
    const party = world.parties.find((entry) => entry.id === partyId)
    const national = world.nationalResults.find((entry) => entry.partyId === partyId)
    return {
      label: party?.name ?? national?.partyName ?? partyId,
      data: history.map((entry) => entry.partySeats[partyId] ?? 0),
      backgroundColor: party?.colour ?? national?.colour ?? '#7a6040',
      borderColor: 'rgba(44, 31, 14, 0.2)',
      borderWidth: 1,
      stack: 'seats',
    }
  }).filter((dataset) => dataset.data.some((seats) => seats > 0))

  return (
    <div className="history-chart-wrap seat-history-chart" style={{ height: 220 }}>
      <Bar
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: ink,
                boxWidth: 10,
                boxHeight: 10,
                font: { size: 11, family: 'Georgia, "Times New Roman", serif' },
              },
            },
            tooltip: {
              backgroundColor: 'rgba(248, 240, 221, 0.97)',
              titleColor: ink,
              bodyColor: ink,
              borderColor: 'rgba(44, 31, 14, 0.25)',
              borderWidth: 1,
              callbacks: {
                label: (ctx) => {
                  const value = ctx.parsed.y
                  if (value == null || value === 0) return ''
                  return `${ctx.dataset.label}: ${value} seat${value === 1 ? '' : 's'}`
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: inkSoft, font: { size: 10 } },
              grid: { display: false },
              border: { color: grid },
            },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                color: inkSoft,
                font: { size: 10 },
                stepSize: 1,
                precision: 0,
              },
              grid: { color: grid },
              border: { color: grid },
            },
          },
        }}
      />
    </div>
  )
})
