import { useMemo, useState } from 'react'

import type { TilePreferenceEstimate, World } from '../types/sim'

type MapMode = 'ward' | 'bloc' | 'voter'

interface MapFigureProps {
  world: World
  mapMode: MapMode
  selectedConstituencyId: string
  selectedBlocId: string
  selectedTileId: string
  blocColours: Record<string, string>
  tilePreferenceById: Map<string, TilePreferenceEstimate>
  onSelectConstituency: (id: string) => void
  onSelectBloc: (id: string) => void
  onSelectTile: (id: string) => void
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  const value = Number.parseInt(normalized, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbaFromHex(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Mix party colour with neutral (desaturated) based on margin.
// A 30%+ margin = full saturation. A 0% margin = very pale.
function marginToAlpha(margin: number): number {
  // margin 0 → alpha 0.22, margin 30+ → alpha 0.82
  return 0.22 + Math.min(1, margin / 30) * 0.60
}

function dominantBlocId(blocMix: Record<string, number>) {
  return Object.entries(blocMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

export function MapFigure({
  world,
  mapMode,
  selectedConstituencyId,
  selectedBlocId,
  selectedTileId,
  blocColours,
  tilePreferenceById,
  onSelectConstituency,
  onSelectBloc,
  onSelectTile,
}: MapFigureProps) {
  const [zoom, setZoom] = useState(1)

  const selectedSeat = useMemo(
    () => world.constituencies.find((seat) => seat.id === selectedConstituencyId),
    [selectedConstituencyId, world.constituencies],
  )
  const selectedTile = useMemo(
    () => world.tiles.find((tile) => tile.id === selectedTileId),
    [selectedTileId, world.tiles],
  )

  const viewBox = useMemo(() => {
    const boxWidth = world.width / zoom
    const boxHeight = world.height / zoom
    const centerX = selectedTile?.x ?? selectedSeat?.seed.x ?? world.width / 2
    const centerY = selectedTile?.y ?? selectedSeat?.seed.y ?? world.height / 2
    const minX = Math.max(0, Math.min(world.width - boxWidth, centerX - boxWidth / 2))
    const minY = Math.max(0, Math.min(world.height - boxHeight, centerY - boxHeight / 2))
    return `${minX} ${minY} ${boxWidth} ${boxHeight}`
  }, [selectedSeat, selectedTile, world, zoom])

  const battlegroundIds = new Set(world.stats.battlegroundWardIds)
  const playerPartyId = world.playerPartyId

  const caption = mapMode === 'ward'
    ? 'Ward view — colour intensity shows lead margin. Dashed borders = battleground.'
    : mapMode === 'bloc'
      ? 'Bloc view — each square shows the strongest neighbourhood bloc.'
      : 'Voter-cluster view — circles show likely winning party per cluster.'

  return (
    <figure className="map-figure">
      <figcaption>{world.townName}. {caption}</figcaption>

      <div className="map-toolbar">
        <label>
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <strong>{zoom.toFixed(1)}x</strong>
        </label>
        <span className="map-selection-note">
          {mapMode === 'ward'
            ? selectedSeat?.name ?? 'Click a ward'
            : mapMode === 'bloc'
              ? 'Click a square to inspect a bloc'
              : selectedTile
                ? `${selectedTile.id}`
                : 'Click a dot to inspect'}
        </span>
      </div>

      <svg viewBox={viewBox} className="map-svg" role="img" aria-label={`Map of ${world.townName}`}>
        <defs>
          <clipPath id="landmass-clip">
            <path d={world.landmass.path} />
          </clipPath>
          <pattern id="paper-grain" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.6" fill="rgba(73,55,31,0.14)" />
            <circle cx="9" cy="6" r="0.5" fill="rgba(73,55,31,0.1)" />
            <circle cx="6" cy="10" r="0.55" fill="rgba(73,55,31,0.09)" />
          </pattern>
          {/* Battleground glow filter */}
          <filter id="battleground-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={world.width} height={world.height} className="sea" />
        <path d={world.landmass.path} className="landmass-shadow" />
        <path d={world.landmass.path} className="landmass-base" />
        <path d={world.landmass.path} fill="url(#paper-grain)" opacity="0.4" />

        <g clipPath="url(#landmass-clip)">
          {mapMode === 'ward'
            ? (
                <>
                  {world.constituencies.map((seat) => {
                    const selected = seat.id === selectedConstituencyId
                    const leader = seat.results[0]
                    const isBattleground = battlegroundIds.has(seat.id)
                    const alpha = selected ? 0.85 : marginToAlpha(seat.margin)
                    return (
                      <path
                        key={seat.id}
                        d={seat.cellPath}
                        className={`constituency-cell${selected ? ' is-selected' : ''}${isBattleground ? ' is-battleground' : ''}`}
                        fill={leader ? rgbaFromHex(leader.colour, alpha) : 'rgba(113,96,63,0.2)'}
                        onClick={() => onSelectConstituency(seat.id)}
                      />
                    )
                  })}

                  {/* Battleground animated rings — drawn on top */}
                  {world.constituencies
                    .filter((seat) => battlegroundIds.has(seat.id))
                    .map((seat) => {
                      const r = world.stats.closestWardMargin
                      const pulseR = 8 + (10 - Math.min(r, 10))
                      return (
                        <circle
                          key={`bg-ring-${seat.id}`}
                          cx={seat.seed.x}
                          cy={seat.seed.y}
                          r={pulseR}
                          className="battleground-ring"
                        />
                      )
                    })}
                </>
              )
            : (
                <>
                  {world.constituencies.map((seat) => (
                    <path
                      key={seat.id}
                      d={seat.cellPath}
                      className={`constituency-outline${seat.id === selectedConstituencyId ? ' is-selected' : ''}`}
                    />
                  ))}

                  {world.tiles.map((tile) => {
                    const blocId = dominantBlocId(tile.blocMix)
                    const preference = tilePreferenceById.get(tile.id)
                    const topParty = preference?.rankings[0]
                    const fill = mapMode === 'bloc'
                      ? blocColours[blocId] ?? '#8d5524'
                      : topParty?.colour ?? '#8d5524'
                    const selected = tile.id === selectedTileId
                    const dimmed = mapMode === 'bloc' && selectedBlocId !== '' && blocId !== selectedBlocId

                    // In voter mode, colour intensity reflects how certain the vote is
                    const certainty = topParty && preference
                      ? Math.max(0, (topParty.support - (preference.rankings[1]?.support ?? 0)) / 50)
                      : 0.5
                    const alpha = selected ? 0.9 : dimmed ? 0.18 : mapMode === 'voter' ? 0.35 + certainty * 0.5 : 0.65

                    const commonProps = {
                      key: tile.id,
                      fill: rgbaFromHex(fill, alpha),
                      className: `tile-mark${selected ? ' is-selected' : ''}`,
                      onClick: () => {
                        onSelectConstituency(tile.constituencyId ?? selectedConstituencyId)
                        onSelectTile(tile.id)
                        onSelectBloc(blocId)
                      },
                    }

                    return mapMode === 'bloc'
                      ? (
                          <rect
                            {...commonProps}
                            x={tile.x - 5}
                            y={tile.y - 5}
                            width={10}
                            height={10}
                            rx={2}
                          />
                        )
                      : (
                          <circle
                            {...commonProps}
                            cx={tile.x}
                            cy={tile.y}
                            r={selected ? 5.4 : 3.8}
                          />
                        )
                  })}
                </>
              )}

          {/* Settlement centres */}
          {world.settlementCenters.map((center) => (
            <g key={center.id} className="settlement-mark">
              <circle cx={center.x} cy={center.y} r={6 + center.urbanity * 9} className="settlement-ring" />
              <circle cx={center.x} cy={center.y} r={1.6 + center.urbanity * 2.2} className="settlement-core" />
            </g>
          ))}
        </g>

        <path d={world.landmass.path} className="landmass-outline" />

        {/* Ward labels in ward mode */}
        {mapMode === 'ward' && world.constituencies.map((seat) => {
          if (seat.population < world.totalPopulation / world.constituencies.length / 2.5) return null
          const isBattleground = battlegroundIds.has(seat.id)
          const isPlayer = seat.leadingPartyId === playerPartyId
          return (
            <text
              key={`${seat.id}-label`}
              x={seat.seed.x}
              y={seat.seed.y}
              className="constituency-label"
              style={{
                fill: isPlayer
                  ? 'rgba(30,15,0,0.9)'
                  : isBattleground
                    ? 'rgba(180,70,0,0.9)'
                    : 'rgba(44,31,14,0.65)',
                fontWeight: isBattleground || isPlayer ? '900' : '700',
              }}
            >
              {seat.name.split(' ')[0]}
            </text>
          )
        })}
      </svg>
    </figure>
  )
}
