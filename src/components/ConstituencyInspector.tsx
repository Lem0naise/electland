import { axisSummary, describeValues, formatPopulation, topBlocEntries } from '../lib/sim'
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
            Pop. {formatPopulation(selectedWard.population)} · {describeValues(selectedWard.values)} · {(selectedWard.urbanity * 100).toFixed(0)}% urban
          </p>

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
              <div className="ward-history-list">
                {(() => {
                  // history is chronological (oldest first); reverse to show newest first
                  const reversed = [...selectedWard.history].reverse().slice(0, 8)
                  return reversed.map((entry, i) => {
                    const party = world.parties.find((p) => p.id === entry.leadingPartyId)
                    // The entry *before* this one in time is at index i+1 in reversed array
                    const olderEntry = reversed[i + 1]
                    // A change occurred if the leader is different from the previous week
                    const leaderChanged = olderEntry != null && olderEntry.leadingPartyId !== entry.leadingPartyId
                    // GAIN = your party took the ward this week (wasn't leading before)
                    // LOSS = your party lost the ward this week (was leading before, isn't now)
                    const yourPartyGained = leaderChanged && entry.leadingPartyId === playerPartyId
                    const yourPartyLost = leaderChanged && olderEntry.leadingPartyId === playerPartyId
                    return (
                      <div key={entry.week} className="history-item">
                        <span className="history-week">Wk {entry.week}</span>
                        <span
                          className="history-swatch"
                          style={{ background: party?.colour ?? '#888' }}
                        />
                        <span className="history-party">{party?.name ?? entry.leadingPartyId}</span>
                        <span className="history-margin">+{entry.margin.toFixed(1)}</span>
                        {yourPartyGained && <span className="history-change held">GAIN</span>}
                        {yourPartyLost && <span className="history-change lost">LOSS</span>}
                        {leaderChanged && !yourPartyGained && !yourPartyLost && (
                          <span className="history-change neutral">FLIPPED</span>
                        )}
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
              {matchingCurrents[0] && <li>{matchingCurrents[0].label} is landing in this ward because of its {matchingCurrents[0].tags.filter((t) => selectedWard.tags.includes(t)).join(', ')} character.</li>}
              <li>{axisSummary(selectedWard.values).join('. ')}.</li>
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
