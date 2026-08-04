import { Line } from 'react-chartjs-2'
import { registerCharts } from './registerCharts'

registerCharts()

export interface PartyShareDataset {
  label: string
  colour: string
  data: Array<number | null>
  emphasize?: boolean
}

export function PartyShareLineChart({
  labels,
  datasets,
  height = 260,
  boundaryLabelIndices = [],
}: {
  labels: string[]
  datasets: PartyShareDataset[]
  height?: number
  /** Label indices that mark election cycle boundaries (vertical annotation lines). */
  boundaryLabelIndices?: number[]
}) {
  const ink = 'rgba(44, 31, 14, 0.72)'
  const inkSoft = 'rgba(44, 31, 14, 0.45)'
  const grid = 'rgba(44, 31, 14, 0.1)'
  const boundarySet = new Set(boundaryLabelIndices)

  return (
    <div className="party-share-line-chart" style={{ height }}>
      <Line
        data={{
          labels,
          datasets: datasets.map((dataset) => ({
            label: dataset.label,
            data: dataset.data,
            borderColor: dataset.colour,
            backgroundColor: dataset.colour,
            pointBackgroundColor: dataset.emphasize ? '#fff' : dataset.colour,
            pointBorderColor: dataset.emphasize ? dataset.colour : dataset.colour,
            pointBorderWidth: dataset.emphasize ? 2 : 1,
            pointRadius: dataset.emphasize ? 4 : 3,
            pointHoverRadius: dataset.emphasize ? 5 : 4,
            borderWidth: dataset.emphasize ? 2.6 : 1.6,
            tension: 0.25,
            spanGaps: true,
          })),
        }}
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
                  if (value == null) return `${ctx.dataset.label}: —`
                  return `${ctx.dataset.label}: ${value.toFixed(1)}%`
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: inkSoft,
                font: { size: 10 },
                callback: (_value, index) => {
                  if (boundarySet.has(index)) return `${labels[index]} ★`
                  // Thin labels on long series
                  if (labels.length > 36 && index % 3 !== 0 && !boundarySet.has(index)) return ''
                  return labels[index]
                },
              },
              grid: {
                color: (ctx) => (boundarySet.has(ctx.index) ? 'rgba(44, 31, 14, 0.35)' : grid),
                lineWidth: (ctx) => (boundarySet.has(ctx.index) ? 1.5 : 1),
              },
              border: { color: grid },
            },
            y: {
              beginAtZero: true,
              ticks: {
                color: inkSoft,
                font: { size: 10 },
                callback: (value) => `${value}%`,
              },
              grid: { color: grid },
              border: { color: grid },
            },
          },
        }}
      />
    </div>
  )
}
