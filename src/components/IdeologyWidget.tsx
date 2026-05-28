import { IDEOLOGY_AXES } from '../lib/sim'

export function IdeologyWidget({ values, colour, compact = false }: {
  values: { change: number; growth: number; services: number }
  colour?: string
  compact?: boolean
}) {
  return (
    <div className={`ideology-widget${compact ? ' compact' : ''}`}>
      {IDEOLOGY_AXES.map((ax) => {
        const val = values[ax.key]
        const pct = ((val + 100) / 200) * 100
        const intensity = Math.abs(val)
        const dotColour = colour ?? (val > 0 ? '#2f6e2f' : val < 0 ? '#7a1c1c' : '#7a6040')
        return (
          <div key={ax.key} className="ideology-row">
            <span className={`ideology-pole left${intensity > 25 && val < 0 ? ' is-dominant' : ''}`}>
              {ax.leftLabel}
            </span>
              <div className="ideology-track">
                <div className="ideology-track-line" />
                <div
                  className="ideology-dot"
                  style={{
                    left: `${pct}%`,
                    background: dotColour,
                  }}
                  title={val > 15 ? `Strongly prefers ${ax.rightLabel}` : val < -15 ? `Strongly prefers ${ax.leftLabel}` : 'Balanced'}
                />
              </div>
            <span className={`ideology-pole right${intensity > 25 && val > 0 ? ' is-dominant' : ''}`}>
              {ax.rightLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
