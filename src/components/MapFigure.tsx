import { useMemo, useRef, useState } from 'react'
import { Delaunay } from 'd3-delaunay'

import { dominantBlocId } from '../lib/sim'
import type { MapMode, TilePreferenceEstimate, World } from '../types/sim'

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
  redistrictTargetWardId?: string
  onSetRedistrictTarget?: (wardId: string) => void
  onDragRedistrictSeeds?: (seeds: Array<{ wardId: string; x: number; y: number }>) => void
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
  return 0.22 + Math.min(1, margin / 30) * 0.60
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
  redistrictTargetWardId,
  onSetRedistrictTarget,
  onDragRedistrictSeeds,
}: MapFigureProps) {
  const [zoom, setZoom] = useState(1)
  const [showControls, setShowControls] = useState(false)
  const [dragWardId, setDragWardId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

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

  const palette = ['#d94841', '#00798c', '#edae49', '#3d405b', '#81b29a', '#8d5524', '#c56b37', '#e65c00', '#008080', '#a0522d', '#4682b4', '#daa520']
  const wardColours: Record<string, string> = {}
  world.constituencies.forEach((c, i) => { wardColours[c.id] = palette[i % palette.length] })

  const caption = mapMode === 'ward'
    ? 'Ward view — colour intensity shows lead margin. Dashed borders = battleground.'
    : mapMode === 'bloc'
      ? 'Bloc view — each square shows the strongest neighbourhood bloc.'
      : mapMode === 'voter'
        ? 'Voter-cluster view — circles show likely winning party per cluster.'
        : 'Redistrict — drag the seed points to reshape wards.'

  return (
    <figure className="map-figure">
      <figcaption>{world.townName}. {caption}</figcaption>

      <div className="map-toolbar">
        <button type="button" className="map-toolbar-toggle" onClick={() => setShowControls((shown) => !shown)}>
          {showControls ? 'Hide map controls' : 'Map controls'}
        </button>
        {showControls && (
          <>
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
          </>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="map-svg"
        role="img"
        aria-label={`Map of ${world.townName}`}
        onMouseMove={(e) => {
          if (!dragWardId || !svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const svgX = ((e.clientX - rect.left) / rect.width) * world.width
          const svgY = ((e.clientY - rect.top) / rect.height) * world.height
          setDragPos({ x: Math.max(0, Math.min(world.width, svgX)), y: Math.max(0, Math.min(world.height, svgY)) })
        }}
        onMouseUp={() => {
          if (!dragWardId || !dragPos) return
          const seeds = world.constituencies.map((c) => ({
            wardId: c.id,
            x: c.id === dragWardId ? dragPos.x : c.seed.x,
            y: c.id === dragWardId ? dragPos.y : c.seed.y,
          }))
          onDragRedistrictSeeds?.(seeds)
          setDragWardId(null)
          setDragPos(null)
        }}
        onMouseLeave={() => { setDragWardId(null); setDragPos(null) }}
      >
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
          {mapMode === 'ward' && (
            <>
              {world.constituencies.map((seat) => {
                const selected = seat.id === selectedConstituencyId
                const leader = seat.results[0]
                const isBattleground = battlegroundIds.has(seat.id)
                const alpha = marginToAlpha(seat.margin)
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

              {world.politicianMode && (() => {
                const playerWard = world.constituencies.find((c) => c.id === world.politicianMode!.politician.wardId)
                return playerWard ? (
                  <path
                    d={playerWard.cellPath}
                    className="politician-ward-highlight"
                    fill="none"
                    stroke={world.parties.find((p) => p.id === world.playerPartyId)?.colour ?? '#f8f0dd'}
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                  />
                ) : null
              })()}
            </>
          )}

          {(mapMode === 'bloc' || mapMode === 'voter') && (
            <>
              {world.constituencies.map((seat) => (
                <path
                  key={seat.id}
                  d={seat.cellPath}
                  className={`constituency-outline${seat.id === selectedConstituencyId ? ' is-selected' : ''}${world.politicianMode?.politician.wardId === seat.id ? ' is-player-ward' : ''}`}
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

                const certainty = topParty && preference
                  ? Math.max(0, (topParty.support - (preference.rankings[1]?.support ?? 0)) / 50)
                  : 0.5
                const alpha = selected ? 0.9 : dimmed ? 0.18 : mapMode === 'voter' ? 0.35 + certainty * 0.5 : 0.65

                const colourProps = {
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
                        key={tile.id}
                        {...colourProps}
                        x={tile.x - 5}
                        y={tile.y - 5}
                        width={10}
                        height={10}
                        rx={2}
                      />
                    )
                  : (
                      <circle
                        key={tile.id}
                        {...colourProps}
                        cx={tile.x}
                        cy={tile.y}
                        r={selected ? 5.4 : 3.8}
                      />
                    )
              })}
            </>
          )}

          {mapMode === 'redistrict' && (
            <>
              {(() => {
                // Compute Voronoi from seeds (with drag offset applied)
                const displaySeeds = world.constituencies.map((c) => {
                  if (dragWardId === c.id && dragPos) return [dragPos.x, dragPos.y] as [number, number]
                  return [c.seed.x, c.seed.y] as [number, number]
                })
                const delaunay = Delaunay.from(displaySeeds)
                const voronoi = delaunay.voronoi([0, 0, world.width, world.height])
                const cellPaths = world.constituencies.map((_, i) => voronoi.renderCell(i))

                // Reassign tiles to nearest seed (temporary visual, not committed)
                const tileWardMap = new Map<string, string>()
                for (const tile of world.tiles) {
                  const nearestIdx = delaunay.find(tile.x, tile.y)
                  tileWardMap.set(tile.id, world.constituencies[nearestIdx]?.id ?? tile.constituencyId ?? '')
                }

                return (
                  <g>
                    {/* Voronoi cell polygons */}
                    {world.constituencies.map((seat, i) => (
                      <path
                        key={seat.id}
                        d={cellPaths[i]}
                        fill={rgbaFromHex(wardColours[seat.id] ?? '#8d5524', seat.id === redistrictTargetWardId ? 0.18 : 0.06)}
                        stroke={seat.id === redistrictTargetWardId ? '#c86400' : 'rgba(44,31,14,0.4)'}
                        strokeWidth={seat.id === redistrictTargetWardId ? 2 : 0.8}
                      />
                    ))}
                    {/* Tile dots colored by their temporary ward assignment */}
                    {world.tiles.map((tile) => {
                      const wId = tileWardMap.get(tile.id) ?? ''
                      const colour = wardColours[wId] ?? '#8d5524'
                      return (
                        <circle
                          key={tile.id}
                          cx={tile.x}
                          cy={tile.y}
                          r={1.8}
                          fill={rgbaFromHex(colour, 0.7)}
                          pointerEvents="none"
                        />
                      )
                    })}
                    {/* Draggable seed points */}
                    {world.constituencies.map((seat) => {
                      const isDragging = dragWardId === seat.id
                      const sx = isDragging && dragPos ? dragPos.x : seat.seed.x
                      const sy = isDragging && dragPos ? dragPos.y : seat.seed.y
                      const r = isDragging ? 10 : 6
                      return (
                        <g key={`seed-${seat.id}`}>
                          <circle
                            cx={sx}
                            cy={sy}
                            r={r + 4}
                            fill="transparent"
                            style={{ cursor: 'grab' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setDragWardId(seat.id)
                              onSetRedistrictTarget?.(seat.id)
                            }}
                          />
                          <circle
                            cx={sx}
                            cy={sy}
                            r={r}
                            fill={wardColours[seat.id] ?? '#8d5524'}
                            stroke="white"
                            strokeWidth={2}
                            style={{ pointerEvents: 'none' }}
                          />
                          <circle
                            cx={sx}
                            cy={sy}
                            r={4}
                            fill="white"
                            stroke={rgbaFromHex(wardColours[seat.id] ?? '#8d5524', 1)}
                            strokeWidth={1.5}
                            style={{ pointerEvents: 'none' }}
                          />
                        </g>
                      )
                    })}
                  </g>
                )
              })()}
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

        {selectedSeat ? (
          <g className="selection-marker is-selected" clipPath="url(#landmass-clip)">
            <circle
              cx={selectedSeat.seed.x}
              cy={selectedSeat.seed.y}
              r={11}
              className="selection-marker-ring"
            />
            <circle
              cx={selectedSeat.seed.x}
              cy={selectedSeat.seed.y}
              r={5.2}
              className="selection-marker-core"
            />
          </g>
        ) : null}

        <path d={world.landmass.path} className="landmass-outline" />

        {/* Ward labels in ward mode */}
        {mapMode === 'ward' && world.constituencies.map((seat) => {
          if (seat.population < world.totalPopulation / world.constituencies.length / 2.5) return null
          const isBattleground = battlegroundIds.has(seat.id)
          const isPlayer = seat.leadingPartyId === playerPartyId
          const hasAutoCampaign = world.activeCampaigns.some((c) => c.wardId === seat.id)
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
              {hasAutoCampaign ? '\u27F3 ' : ''}{seat.name.split(' ')[0]}
            </text>
          )
        })}

        {/* Ward labels in redistrict mode — click to highlight */}
        {mapMode === 'redistrict' && world.constituencies.map((seat) => (
          <text
            key={`${seat.id}-label`}
            x={seat.seed.x + 10}
            y={seat.seed.y - 10}
            className="constituency-label"
            style={{
              fill: seat.id === redistrictTargetWardId
                ? 'rgba(200,60,0,0.95)'
                : 'rgba(44,31,14,0.5)',
              fontWeight: seat.id === redistrictTargetWardId ? '900' : '500',
              cursor: 'pointer',
              fontSize: 11,
            }}
            onClick={() => onSetRedistrictTarget?.(seat.id)}
          >
            {seat.name.split(' ')[0]}
          </text>
        ))}
      </svg>
    </figure>
  )
}
