import { Line } from 'react-chartjs-2'
import type { Plugin } from 'chart.js'
import { registerCharts } from './registerCharts'

registerCharts()

export interface PartyShareDataset {
  label: string
  colour: string
  data: Array<number | null>
  emphasize?: boolean
}

function electionMarkerPlugin(boundaryIndices: number[]): Plugin<'line'> {
  const indexSet = new Set(boundaryIndices)
  return {
    id: 'electionMarkers',
    afterDatasetsDraw(chart) {
      if (indexSet.size === 0) return
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return
      const { ctx, chartArea } = chart
      if (!chartArea) return

      ctx.save()
      ctx.strokeStyle = 'rgba(44, 31, 14, 0.55)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.font = '600 10px Georgia, "Times New Roman", serif'
      ctx.fillStyle = 'rgba(44, 31, 14, 0.65)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'

      for (const index of indexSet) {
        const point = meta.data[index]
        if (!point || typeof point.x !== 'number') continue
        const x = point.x
        ctx.beginPath()
        ctx.moveTo(x, chartArea.top)
        ctx.lineTo(x, chartArea.bottom)
        ctx.stroke()
        ctx.fillText('Election', x, chartArea.top - 2)
      }
      ctx.restore()
    },
  }
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
  /** Label indices that mark election weeks (vertical marker lines). */
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
        plugins={[electionMarkerPlugin(boundaryLabelIndices)]}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 14 } },
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
                title: (items) => {
                  const index = items[0]?.dataIndex ?? -1
                  const base = items[0]?.label ?? ''
                  return boundarySet.has(index) ? `${base} · Election` : base
                },
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
                color: (ctx) => (boundarySet.has(ctx.index) ? ink : inkSoft),
                font: {
                  size: 10,
                  weight: (ctx) => (boundarySet.has(ctx.index) ? 700 : 400),
                },
                callback: (_value, index) => {
                  if (boundarySet.has(index)) return labels[index]
                  if (labels.length > 36 && index % 3 !== 0) return ''
                  return labels[index]
                },
              },
              grid: { color: grid },
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
