import { axisSummary, describeValues, formatPopulation, IDEOLOGY_AXES, topBlocEntries, wardFitSentence } from '../lib/sim'
import type { Constituency, PopulationTile, TilePreferenceEstimate, World } from '../types/sim'

type MapMode = 'ward' | 'bloc' | 'voter'

interface ConstituencyInspectorProps {
  world: World | null
  constituency: Constituency | undefined
  mapMode: MapMode
  selectedBlocId: string
  selectedTile: PopulationTile | undefined
  selectedTileEstimate: TilePreferenceEstimate | null
}

function valueFit(a: { change: number; growth: number; services: number }, b: { change: number; growth: number; services: number }) {
  return Math.sqrt((a.change - b.change) ** 2 + (a.growth - b.growth) ** 2 + (a.services - b.services) ** 2)
}

export function ConstituencyInspector({
  world,
  constituency,
  mapMode,
  selectedBlocId,
  selectedTile,
  selectedTileEstimate,
}: ConstituencyInspectorProps) {
  if (!world) {
    return (
      <section className="panel constituency-panel">
        <div className="panel-kicker">Ward Detail</div>
        <p>Generate a town to inspect wards, blocs, and voter clusters.</p>
      </section>
    )
  }

  const selectedBloc = world.blocs.find((bloc) => bloc.id === selectedBlocId)
  const selectedWard = constituency ?? (selectedTile ? world.constituencies.find((c) => c.id === selectedTile.constituencyId) : undefined)
  const blocs = selectedWard ? topBlocEntries(selectedWard.blocMix) : []

  const matchingCurrents = selectedWard
    ? world.currents.filter((c) => c.tags.some((tag) => selectedWard.tags.includes(tag)))
    : []

  const isBattleground = selectedWard ? world.stats.battlegroundWardIds.includes(selectedWard.id) : false
  const playerPartyId = world.playerPartyId

  const blocStrongholds = selectedBloc
    ? [...world.constituencies]
        .map((seat) => ({ seat, share: (seat.blocMix[selectedBloc.id] ?? 0) * 100 }))
        .sort((a, b) => b.share - a.share)
        .slice(0, 4)
    : []

  const blocPartyFits = selectedBloc
    ? [...world.parties]
        .map((party) => ({ party, distance: valueFit(party.values, selectedBloc.center) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4)
    : []

  const tileBlocs = selectedTile ? topBlocEntries(selectedTile.blocMix, 4) : []
  const tileWard = selectedTile ? world.constituencies.find((c) => c.id === selectedTile.constituencyId) : undefined
  const topTileParty = selectedTileEstimate?.rankings[0]
  const secondTileParty = selectedTileEstimate?.rankings[1]
  const tileLeadMargin = topTileParty && secondTileParty ? topTileParty.support - secondTileParty.support : null

  return (
    <section className="panel constituency-panel">
      <div className="panel-kicker">Ward Detail</div>

      {/* ── Ward mode ─────────────────────────────────────────────────── */}
      {mapMode === 'ward' && selectedWard && (
        <>
          <div className="ward-header-row">
            <h3>{selectedWard.name}</h3>
            {isBattleground && <span className="battleground-badge">BATTLEGROUND</span>}
          </div>
          <p className="ward-mood">
            Pop. {formatPopulation(selectedWard.population)} · {(selectedWard.urbanity * 100).toFixed(0)}% urban
          </p>

          {/* Ideology + fit block */}
          {(() => {
            const playerParty = world.parties.find((p) => p.id === playerPartyId)
            const fit = playerParty ? wardFitSentence(playerParty.values, selectedWard.values) : null

            return (
              <div className={`ward-fit-block ward-fit-${fit?.quality ?? 'neutral'}`}>
                {/* Per-axis comparison */}
                <div className="ward-fit-axes">
                  {IDEOLOGY_AXES.map((ax) => {
                    const wardVal = selectedWard.values[ax.key]
                    const partyVal = playerParty?.values[ax.key] ?? 0
                    const diff = Math.abs(wardVal - partyVal)
                    const wardPos = ((wardVal + 100) / 200) * 100
                    const partyPos = ((partyVal + 100) / 200) * 100
                    const matchLevel: 'close' | 'moderate' | 'far' = diff < 20 ? 'close' : diff < 50 ? 'moderate' : 'far'
                    return (
                      <div key={ax.key} className="ward-fit-axis-row">
                        <span className="wfa-label">{ax.rightLabel}</span>
                        <div className="wfa-track">
                          {/* Ward dot */}
                          <span
                            className="wfa-dot wfa-ward"
                            style={{ left: `${wardPos}%` }}
                            title={`Ward: ${wardVal > 0 ? ax.rightShort : ax.leftShort} (${wardVal.toFixed(0)})`}
                          />
                          {/* Player party dot */}
                          {playerParty && (
                            <span
                              className="wfa-dot wfa-party"
                              style={{ left: `${partyPos}%`, background: playerParty.colour }}
                              title={`You: ${partyVal > 0 ? ax.rightShort : ax.leftShort} (${partyVal.toFixed(0)})`}
                            />
                          )}
                          {/* Gap indicator */}
                          {playerParty && (
                            <span
                              className={`wfa-gap wfa-gap-${matchLevel}`}
                              style={{
                                left: `${Math.min(wardPos, partyPos)}%`,
                                width: `${Math.abs(wardPos - partyPos)}%`,
                              }}
                            />
                          )}
                        </div>
                        <span className={`wfa-match wfa-match-${matchLevel}`}>
                          {matchLevel === 'close' ? '✓' : matchLevel === 'moderate' ? '~' : '✗'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="ward-fit-legend">
                  <span className="wfl-ward">◆ Ward voters</span>
                  {playerParty && (
                    <span className="wfl-party" style={{ color: playerParty.colour }}>● {playerParty.name}</span>
                  )}
                </div>
                {/* Overall verdict */}
                {fit && (
                  <div className="ward-fit-verdict">
                    {fit.sentence}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Neighbourhood demographics */}
          <div className="bloc-mix-section">
            <h4>Who lives here</h4>
            <p className="bloc-mix-explainer">Resident groups — not a poll, this is who makes up the ward's population.</p>
            <div className="bloc-list">
              {blocs.map((bloc) => {
                const blocColourMap: Record<string, string> = {
                  market_regulars: '#d94841',
                  river_walkers: '#00798c',
                  old_town_loyalists: '#edae49',
                  workshop_crews: '#3d405b',
                  hill_street_households: '#81b29a',
                  college_corner: '#8d5524',
                  pondside_peacemakers: '#c56b37',
                }
                return (
                  <div key={bloc.key} className="bloc-row">
                    <span className="bloc-dot" style={{ background: blocColourMap[bloc.key] ?? '#888' }} />
                    <span className="bloc-label">{bloc.label}</span>
                    <div className="bloc-bar-wrap">
                      <div
                        className="bloc-bar"
                        style={{ width: `${Math.min(100, bloc.share)}%`, background: blocColourMap[bloc.key] ?? '#888' }}
                      />
                    </div>
                    <span className="bloc-pct">{bloc.share.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick stats */}
          <div className="detail-strip">
            <div className="detail-strip-item">
              <span className="label">Turnout</span>
              <strong>{(selectedWard.turnout * 100).toFixed(1)}%</strong>
            </div>
            <div className="detail-strip-item">
              <span className="label">Character</span>
              <strong>{selectedWard.tags.slice(0, 2).join(', ')}</strong>
            </div>
            <div className="detail-strip-item">
              <span className="label">Issue</span>
              <strong>{matchingCurrents[0]?.label ?? 'None active'}</strong>
              {matchingCurrents[0] && <small>{matchingCurrents[0].description}</small>}
            </div>
          </div>

          {/* Ward history */}
          {selectedWard.history.length > 0 && (
            <div>
              <h4>History</h4>
              <div className="ward-history-scroll">
                {(() => {
                  // Show all history, newest first
                  const reversed = [...selectedWard.history].reverse()
                  // Scale bars: widest margin in this ward's history = 100%
                  const maxMargin = Math.max(...reversed.map((e) => e.margin), 1)

                  return reversed.map((entry, i) => {
                    const party = world.parties.find((p) => p.id === entry.leadingPartyId)
                    const olderEntry = reversed[i + 1]
                    const leaderChanged = olderEntry != null && olderEntry.leadingPartyId !== entry.leadingPartyId
                    const yourPartyGained = leaderChanged && entry.leadingPartyId === playerPartyId
                    const yourPartyLost = leaderChanged && olderEntry.leadingPartyId === playerPartyId
                    const barWidth = (entry.margin / maxMargin) * 100

                    return (
                      <div key={entry.week} className="history-item">
                        <span className="history-week">Wk {entry.week}</span>
                        <span
                          className="history-swatch"
                          style={{ background: party?.colour ?? '#888' }}
                        />
                        <span className="history-party">{party?.name ?? entry.leadingPartyId}</span>
                        {/* Badge slot — always present to keep grid alignment */}
                        <span className="history-badge-slot">
                          {yourPartyGained && <span className="history-change held">GAIN</span>}
                          {yourPartyLost && <span className="history-change lost">LOSS</span>}
                          {leaderChanged && !yourPartyGained && !yourPartyLost && (
                            <span className="history-change neutral">FLIP</span>
                          )}
                        </span>
                        {/* Margin bar, coloured by party */}
                        <div className="history-bar-wrap">
                          <div
                            className="history-bar-fill"
                            style={{
                              width: `${barWidth}%`,
                              background: party?.colour ?? '#888',
                            }}
                          />
                        </div>
                        <span className="history-margin">+{entry.margin.toFixed(1)}</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* Why */}
          <details className="why-section">
            <summary className="why-summary">Why this ward leans this way</summary>
            <ul className="detail-bullets">
              {selectedWard.results[0] && (
                <li>{selectedWard.results[0].partyName} leads by {selectedWard.margin.toFixed(1)} pts — {selectedWard.margin < 5 ? 'razor thin' : selectedWard.margin < 15 ? 'modest lead' : 'comfortable margin'}.</li>
              )}
              {blocs[0] && <li>{blocs[0].label} makes up {blocs[0].share.toFixed(0)}% of this ward and shapes its baseline mood.</li>}
              {matchingCurrents[0] && <li>{matchingCurrents[0].label} is active here.</li>}
              <li>Voter values: {axisSummary(selectedWard.values).join(', ')}.</li>
            </ul>
          </details>
        </>
      )}

      {/* ── Bloc mode ─────────────────────────────────────────────────── */}
      {mapMode === 'bloc' && selectedBloc && (
        <>
          <h3>{selectedBloc.label}</h3>
          <p className="ward-mood">{selectedBloc.summary}</p>

          <div className="detail-strip">
            <div className="detail-strip-item">
              <span className="label">Townwide share</span>
              <strong>{(selectedBloc.weight * 100).toFixed(1)}%</strong>
            </div>
            <div className="detail-strip-item">
              <span className="label">Turnout habit</span>
              <strong>{((selectedBloc.turnout ?? 0.8) * 100).toFixed(0)}%</strong>
            </div>
            <div className="detail-strip-item">
              <span className="label">Home turf</span>
              <strong>{selectedBloc.homeRole}</strong>
            </div>
          </div>

          <div>
            <h4>Strongest wards</h4>
            <div className="bloc-list">
              {blocStrongholds.map(({ seat, share }) => (
                <div key={seat.id} className="bloc-row">
                  <span className="bloc-label">{seat.name}</span>
                  <div className="bloc-bar-wrap">
                    <div className="bloc-bar" style={{ width: `${Math.min(100, share)}%`, background: '#7a6040' }} />
                  </div>
                  <span className="bloc-pct">{share.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4>Best party fits</h4>
            <div className="candidates-list">
              {blocPartyFits.map(({ party, distance }) => (
                <div key={party.id} className="candidate-row">
                  <span className="candidate-initials" style={{ background: party.colour }}>
                    {party.leader.split(' ').map((n) => n[0]).join('')}
                  </span>
                  <div className="candidate-info">
                    <span className="candidate-name">{party.name}</span>
                    <span className="candidate-party">{party.leader}</span>
                  </div>
                  <strong className="candidate-share">{Math.max(0, 100 - distance).toFixed(0)}</strong>
                </div>
              ))}
            </div>
          </div>

          <ul className="detail-bullets">
            <li>{axisSummary(selectedBloc.center).join('. ')}.</li>
            <li>Cluster around {selectedBloc.preferredTags.join(', ')} areas.</li>
            {blocStrongholds[0] && <li>{blocStrongholds[0].seat.name} is their clearest base ({blocStrongholds[0].share.toFixed(0)}%).</li>}
          </ul>
        </>
      )}

      {/* ── Voter cluster mode ────────────────────────────────────────── */}
      {mapMode === 'voter' && selectedTile && selectedTileEstimate && (
        <>
          <h3>{tileWard?.name ?? 'Voter Cluster'}</h3>
          <p className="ward-mood">
            Cluster {selectedTile.id} · Pop. {formatPopulation(selectedTile.population)} · {describeValues(selectedTile.values)}
          </p>

          <div>
            <h4>Likely vote</h4>
            <div className="candidates-list">
              {selectedTileEstimate.rankings.slice(0, 4).map((result, rank) => (
                <div key={result.partyId} className={`candidate-row${rank === 0 ? ' is-winner' : ''}${result.partyId === playerPartyId ? ' is-player-party' : ''}`}>
                  <span className="candidate-initials" style={{ background: result.colour }}>
                    {result.partyName.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="candidate-info">
                    <span className="candidate-name">{result.partyName}</span>
                  </div>
                  <div className="candidate-bar-wrap">
                    <div className="candidate-bar" style={{ width: `${Math.min(100, result.support)}%`, background: result.colour }} />
                  </div>
                  <strong className="candidate-share">{result.support.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="bloc-mix-section">
            <h4>Who lives here</h4>
            <p className="bloc-mix-explainer">Resident demographics — not a poll.</p>
            <div className="bloc-list">
              {tileBlocs.map((bloc) => (
                <div key={bloc.key} className="bloc-row">
                  <span className="bloc-dot" style={{ background: '#7a6040' }} />
                  <span className="bloc-label">{bloc.label}</span>
                  <div className="bloc-bar-wrap">
                    <div className="bloc-bar" style={{ width: `${Math.min(100, bloc.share)}%`, background: '#7a6040' }} />
                  </div>
                  <span className="bloc-pct">{bloc.share.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="detail-strip">
            <div className="detail-strip-item">
              <span className="label">Likely turnout</span>
              <strong>{(selectedTileEstimate.turnout * 100).toFixed(1)}%</strong>
            </div>
            <div className="detail-strip-item">
              <span className="label">Urban feel</span>
              <strong>{(selectedTile.urbanity * 100).toFixed(0)}%</strong>
            </div>
            <div className="detail-strip-item">
              <span className="label">Tags</span>
              <strong>{selectedTile.tags.slice(0, 2).join(', ')}</strong>
            </div>
          </div>

          <ul className="detail-bullets">
            <li>{topTileParty?.partyName ?? 'No party'} leads with {secondTileParty && tileLeadMargin !== null ? `${tileLeadMargin.toFixed(1)} pts over ${secondTileParty.partyName}.` : 'no close challenger.'}</li>
            <li>{tileBlocs[0]?.label ?? 'No bloc'} is the dominant bloc here.</li>
            <li>{axisSummary(selectedTile.values).join('. ')}.</li>
          </ul>
        </>
      )}

      {mapMode === 'bloc' && !selectedBloc && <p className="ward-mood">Click a coloured square on the map to inspect that neighbourhood bloc.</p>}
      {mapMode === 'voter' && (!selectedTile || !selectedTileEstimate) && <p className="ward-mood">Click a voter-cluster dot on the map to inspect it.</p>}
      {mapMode === 'ward' && !selectedWard && <p className="ward-mood">Click a ward on the map to inspect it.</p>}
    </section>
  )
}
