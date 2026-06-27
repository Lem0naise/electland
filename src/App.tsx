import { useCallback, useEffect, useMemo, useState } from 'react'

import './App.css'
import { ConstituencyInspector } from './components/ConstituencyInspector'
import { MapFigure } from './components/MapFigure'
import { StatisticsModal } from './components/StatisticsModal'
import { CoalitionModal } from './components/CoalitionModal'
import { BudgetModal } from './components/BudgetModal'
import { GovernmentDashboard } from './components/GovernmentDashboard'
import { ElectionNightModal } from './components/ElectionNightModal'
import { GovernanceModal } from './components/GovernanceModal'
import { ActionFlash } from './components/ActionFlash'
import { CampaignActionsPanel } from './components/CampaignActionsPanel'
import { SeatBar } from './components/SeatBar'
import { SetupScreen } from './components/SetupScreen'
import { saveGame, loadGame, hasSave, exportSaveGame, importSaveGame } from './lib/persistence'
import {
  applyCampaignAction,
  calculateResults,
  dominantBlocId,
  estimateTilePreference,
  generateGovernanceDecisions,
  generateWorld,
  recalculateWardAggregates,
  redistributeSnapshot,
  regenerateCellPaths,
  restoreRedistributeSnapshot,
  simulateWeek,
  strategyTagsForValues,
} from './lib/sim'
import type {
  ActionResult,
  ActiveCampaign,
  CampaignAction,
  MapMode,
  PartyEdit,
  PartyDefinition,
  PopulationTile,
  World,
} from './types/sim'

const blocPalette = ['#d94841', '#00798c', '#edae49', '#3d405b', '#81b29a', '#8d5524', '#c56b37']

function App() {
  const [constituencyCount, setConstituencyCount] = useState(10)
  const [world, setWorld] = useState<World | null>(null)
  const [previousWorld, setPreviousWorld] = useState<World | null>(null)
  const [selectedConstituencyId, setSelectedConstituencyId] = useState('')
  const [selectedBlocId, setSelectedBlocId] = useState('')
  const [selectedTileId, setSelectedTileId] = useState('')
  const [mapMode, setMapMode] = useState<MapMode>('ward')
  const [menuOpen, setMenuOpen] = useState(true)
  const [lastActionResult, setLastActionResult] = useState<ActionResult | null>(null)
  const [showElectionNight, setShowElectionNight] = useState(false)
  const [showGovernance, setShowGovernance] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showCoalitionModal, setShowCoalitionModal] = useState(false)
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [showGovDashboard, setShowGovDashboard] = useState(false)
  const [redistrictTargetWardId, setRedistrictTargetWardId] = useState('')
  const [redistrictSnapshot, setRedistrictSnapshot] = useState<Map<string, string> | null>(null)

  const selectedConstituency = useMemo(
    () => world?.constituencies.find((seat) => seat.id === selectedConstituencyId),
    [world, selectedConstituencyId],
  )

  const blocColours = useMemo(
    () => Object.fromEntries((world?.blocs ?? []).map((bloc, index) => [bloc.id, blocPalette[index % blocPalette.length]])),
    [world],
  )

  const selectedTile = useMemo(
    () => world?.tiles.find((tile) => tile.id === selectedTileId),
    [selectedTileId, world],
  )

  const constituencyTiles = useMemo(
    () => world?.tiles.filter((tile) => tile.constituencyId === selectedConstituencyId).sort((a, b) => b.population - a.population) ?? [],
    [selectedConstituencyId, world],
  )

  const tilePreferenceById = useMemo(() => {
    if (!world) return new Map()
    return new Map(world.tiles.map((tile) => [tile.id, estimateTilePreference(world, tile)]))
  }, [world])

  const selectedTileEstimate = selectedTile ? tilePreferenceById.get(selectedTile.id) ?? null : null

  const previousNationalById = useMemo(
    () => new Map((previousWorld?.nationalResults ?? []).map((result) => [result.partyId, result])),
    [previousWorld],
  )

  const playerParty = world?.parties.find((party) => party.id === world.playerPartyId)
  const playerResult = world?.nationalResults.find((r) => r.partyId === world.playerPartyId)

  useEffect(() => {
    if (!world) {
      setSelectedBlocId('')
      setSelectedTileId('')
      return
    }
    if (!selectedConstituencyId || !world.constituencies.some((seat) => seat.id === selectedConstituencyId)) {
      setSelectedConstituencyId(world.constituencies[0]?.id ?? '')
    }
  }, [selectedConstituencyId, world])

  useEffect(() => {
    if (!selectedConstituency) return
    const defaultBlocId = dominantBlocId(selectedConstituency.blocMix)
    if (!selectedBlocId || !world?.blocs.some((bloc) => bloc.id === selectedBlocId)) {
      setSelectedBlocId(defaultBlocId)
    }
    if (!selectedTileId || !constituencyTiles.some((tile) => tile.id === selectedTileId)) {
      setSelectedTileId(constituencyTiles[0]?.id ?? '')
    }
  }, [constituencyTiles, selectedBlocId, selectedConstituency, selectedTileId, world])

  useEffect(() => {
    if (world?.electionNightActive && !showElectionNight) {
      setShowElectionNight(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world?.electionNightActive])

  useEffect(() => {
    if (world?.isGoverning && world.governanceDecisions.some((d) => !d.resolved)) {
      setShowGovernance(true)
    }
  }, [world?.isGoverning, world?.governanceDecisions])

  const handleSavePartyEdit = useCallback((edit: PartyEdit) => {
    setWorld((prev) => {
      if (!prev) return prev
      const patchParty = (p: PartyDefinition) => {
        if (p.id !== edit.id) return p
        const updated: PartyDefinition = { ...p, name: edit.name || p.name, leader: edit.leader || p.leader, colour: edit.colour }
        if (edit.values) {
          updated.values = edit.values
          updated.strategyTags = strategyTagsForValues(edit.values)
        }
        return updated
      }
      return {
        ...prev,
        parties: prev.parties.map(patchParty),
        constituencies: prev.constituencies.map((c) => ({
          ...c,
          candidates: c.candidates.map((cand) =>
            cand.partyId !== edit.id ? cand : { ...cand, partyName: edit.name || cand.partyName, partyColour: edit.colour },
          ),
        })),
      }
    })
  }, [])

  const handleSetupStart = useCallback((seed?: number, playerPartyIdArg?: string, edits?: PartyEdit[]) => {
    if (seed !== undefined && seed !== world?.seed) {
      const nextWorld = generateWorld({ seed, constituencyCount, customParties: [], playerPartyId: playerPartyIdArg })
      setPreviousWorld(null)
      setWorld(nextWorld)
      setShowElectionNight(false)
      setShowGovernance(false)
      setLastActionResult(null)
      setSelectedConstituencyId(nextWorld.constituencies[0]?.id ?? '')
      setSelectedBlocId(dominantBlocId(nextWorld.constituencies[0]?.blocMix ?? {}))
      setSelectedTileId(nextWorld.tiles.find((t) => t.constituencyId === nextWorld.constituencies[0]?.id)?.id ?? '')
    } else {
      setWorld((prev) => {
        if (!prev) return prev
        let next = prev
        if (edits && edits.length > 0) {
          next = edits.reduce((w, edit) => {
            const patchParty = (p: PartyDefinition) => {
              if (p.id !== edit.id) return p
              const updated: PartyDefinition = { ...p, name: edit.name || p.name, leader: edit.leader || p.leader, colour: edit.colour }
              if (edit.values) {
                updated.values = edit.values
                updated.strategyTags = strategyTagsForValues(edit.values)
              }
              return updated
            }
            return {
              ...w,
              parties: w.parties.map(patchParty),
              constituencies: w.constituencies.map((c) => ({
                ...c,
                candidates: c.candidates.map((cand) =>
                  cand.partyId !== edit.id ? cand : { ...cand, partyName: edit.name || cand.partyName, partyColour: edit.colour },
                ),
              })),
            }
          }, next)
        }
        if (playerPartyIdArg && playerPartyIdArg !== next.playerPartyId) {
          next = { ...next, playerPartyId: playerPartyIdArg }
        }
        return next
      })
    }
    setMenuOpen(false)
  }, [world?.seed, constituencyCount])

  const advanceWeek = () => {
    if (!world) return
    setPreviousWorld(world)
    const nextWorld = simulateWeek(world)
    setWorld(nextWorld)
    // Show NPC pact events
    const newPactLines = nextWorld.newsFeed.slice(0, 5).filter(
      (l) => l.includes('form a pact') || l.includes('proposes a pact with you') || l.includes('breaks their alliance pact') || l.includes('abandons their pact'),
    )
    if (newPactLines.length > 0) {
      const desc = newPactLines[0].replace(/^Week \d+: /, '')
      const isBreak = newPactLines[0].includes('breaks')
      setLastActionResult({
        action: { type: isBreak ? 'break_alliance' : 'propose_alliance', label: '', description: '', apCost: 0 },
        outcome: isBreak ? 'neutral' as const : 'success' as const,
        description: desc,
      })
    }
  }

  const handleSave = () => {
    if (!world) return
    saveGame(world, previousWorld, constituencyCount)
    setLastActionResult({
      action: { type: 'canvass', label: '', description: '', apCost: 0 },
      outcome: 'success',
      description: `Game saved — Week ${world.week}, ${world.townName}`,
    })
  }

  const handleLoad = () => {
    const data = loadGame()
    if (!data) return
    applyLoadedSave(data)
  }

  const handleExport = () => {
    if (!world) return
    exportSaveGame(world, previousWorld, constituencyCount)
  }

  const handleImport = async () => {
    const data = await importSaveGame()
    if (!data) return
    saveGame(data.world, data.previousWorld, data.constituencyCount)
    applyLoadedSave(data)
  }

  const applyLoadedSave = (data: { world: World; previousWorld: World | null; constituencyCount: number }) => {
    setWorld(data.world)
    setPreviousWorld(data.previousWorld)
    setConstituencyCount(data.constituencyCount)
    setShowElectionNight(false)
    setShowGovernance(false)
    setLastActionResult(null)
    setSelectedConstituencyId(data.world.constituencies[0]?.id ?? '')
    setSelectedBlocId(dominantBlocId(data.world.constituencies[0]?.blocMix ?? {}))
    setSelectedTileId(data.world.tiles.find((t) => t.constituencyId === data.world.constituencies[0]?.id)?.id ?? '')
    setMenuOpen(false)
  }

  const handleAction = (action: CampaignAction) => {
    if (!world) return
    const { world: nextWorld, result } = applyCampaignAction(world, action)
    setWorld(nextWorld)
    setLastActionResult(result)
  }

  const handleTogglePermanent = (campaign: ActiveCampaign) => {
    if (!world) return
    const existing = world.activeCampaigns.find((c) => c.id === campaign.id || (c.wardId === campaign.wardId && c.type === campaign.type))
    if (existing) {
      setWorld((prev) => prev ? { ...prev, activeCampaigns: prev.activeCampaigns.filter((c) => c !== existing) } : prev)
    } else {
      const upfrontCost = campaign.apCostPerTurn
      if (world.playerActionPoints < upfrontCost) return
      setWorld((prev) => prev ? { ...prev, playerActionPoints: prev.playerActionPoints - upfrontCost, activeCampaigns: [...prev.activeCampaigns, campaign] } : prev)
    }
  }

  const handleGovernanceDecision = (decisionId: string, choiceIndex: number) => {
    if (!world) return
    const decision = world.governanceDecisions.find((d) => d.id === decisionId)
    const choice = decision?.choices[choiceIndex]
    const newsFeedLine = `Week ${world.week}: Council decision — ${decision?.headline ?? 'decision made'} — you chose "${choice?.label ?? '?'}".`
    const newRecord = decision && choice ? { week: world.week, headline: decision.headline, choice: choice.label } : null
    setWorld((prev) => prev ? {
      ...prev,
      governanceDecisions: prev.governanceDecisions.map((d) =>
        d.id === decisionId ? { ...d, resolved: true, chosenIndex: choiceIndex } : d,
      ),
      parties: prev.parties.map((p) => {
        if (p.id === world.playerPartyId && choice) {
          return { ...p, baseUtility: Math.min(1.2, p.baseUtility + choice.effect.playerUtilityDelta) }
        }
        if (prev.coalitionPartnerId && p.id === prev.coalitionPartnerId && choice) {
          const blocBonus = Object.values(choice.effect.blocEffects).reduce((sum, v) => sum + v, 0) / Math.max(1, Object.keys(choice.effect.blocEffects).length)
          return { ...p, baseUtility: Math.min(1.2, p.baseUtility + blocBonus * 0.3) }
        }
        return p
      }),
      newsFeed: [newsFeedLine, ...prev.newsFeed].slice(0, 30),
      councilHistory: newRecord ? [...(prev.councilHistory ?? []), newRecord] : (prev.councilHistory ?? []),
    } : prev)
    const nextDecisions = world.governanceDecisions.map((d) =>
      d.id === decisionId ? { ...d, resolved: true, chosenIndex: choiceIndex } : d,
    )
    const stillPending = nextDecisions.filter((d) => !d.resolved)
    if (stillPending.length === 0) setShowGovernance(false)
  }

  const focusTile = (tileId: string) => {
    if (!world) return
    const tile = world.tiles.find((entry) => entry.id === tileId)
    if (!tile) return
    setSelectedTileId(tile.id)
    setSelectedBlocId(dominantBlocId(tile.blocMix))
    if (tile.constituencyId) setSelectedConstituencyId(tile.constituencyId)
  }

  const handleStartRedistrict = () => {
    if (!world) return
    setRedistrictSnapshot(redistributeSnapshot(world.tiles))
    setMapMode('redistrict')
    setRedistrictTargetWardId(world.constituencies[0]?.id ?? '')
    setSelectedBlocId('')
    setSelectedTileId('')
    setSelectedConstituencyId('')
  }

  const handleDragSeeds = (seeds: Array<{ wardId: string; x: number; y: number }>) => {
    if (!world) return
    for (const s of seeds) {
      const ward = world.constituencies.find((c) => c.id === s.wardId)
      if (ward) {
        ward.seed.x = s.x
        ward.seed.y = s.y
      }
    }
    setWorld({ ...world })
  }

  const handleDoneRedistrict = () => {
    if (!world) return
    const updatedSeats = recalculateWardAggregates(world)
    const withPaths = regenerateCellPaths(updatedSeats)
    const worldWithSeats = { ...world, constituencies: withPaths }
    const results = calculateResults(worldWithSeats)
    const nextWorld = {
      ...worldWithSeats,
      constituencies: results.constituencies,
      nationalResults: results.nationalResults,
    }
    setWorld(nextWorld)
    setMapMode('ward')
    setRedistrictTargetWardId('')
    setRedistrictSnapshot(null)
    setSelectedConstituencyId(nextWorld.constituencies[0]?.id ?? '')
    setSelectedBlocId(dominantBlocId(nextWorld.constituencies[0]?.blocMix ?? {}))
    setSelectedTileId(nextWorld.tiles.find((t) => t.constituencyId === nextWorld.constituencies[0]?.id)?.id ?? '')
  }

  const handleCancelRedistrict = () => {
    if (!world || !redistrictSnapshot) return
    restoreRedistributeSnapshot(world.tiles, redistrictSnapshot)
    setWorld({ ...world })
    setMapMode('ward')
    setRedistrictTargetWardId('')
    setRedistrictSnapshot(null)
  }

  const electionIn = world?.weeksUntilElection ?? 0
  const majority = world?.stats.councilMajority ?? 0
  const playerSeats = playerResult?.seatsWon ?? 0
  const seatsNeeded = majority - playerSeats

  return (
    <div className="newspaper-shell">
      {!menuOpen && (
      <header className="masthead">
        <div className="masthead-rule" />
        <div className="masthead-inner">
          <h1>Electland Gazette</h1>
          {world && (
            <div className="masthead-meta">
              <span>{world.townName} Council</span>
              <span>Week {world.week}</span>
              <span className={`election-countdown${electionIn <= 4 ? ' urgent' : ''}`}>
                {electionIn === 0 ? 'Election today!' : `Election in ${electionIn} week${electionIn !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}
        </div>
        <div className="masthead-rule" />
      </header>
      )}

      <main className="front-page">
        {menuOpen && (
          <SetupScreen
            world={world}
            constituencyCount={constituencyCount}
            onSetConstituencyCount={setConstituencyCount}
            hasSaveGame={hasSave()}
            onLoad={handleLoad}
            onExport={handleExport}
            onImport={handleImport}
            onGenerate={() => {
              const nextWorld = generateWorld({ seed: Date.now(), constituencyCount, customParties: [], playerPartyId: undefined })
              setPreviousWorld(null)
              setWorld(nextWorld)
              setShowElectionNight(false)
              setShowGovernance(false)
              setLastActionResult(null)
              setSelectedConstituencyId(nextWorld.constituencies[0]?.id ?? '')
              setSelectedBlocId(dominantBlocId(nextWorld.constituencies[0]?.blocMix ?? {}))
              setSelectedTileId(nextWorld.tiles.find((t) => t.constituencyId === nextWorld.constituencies[0]?.id)?.id ?? '')
            }}
            onStart={handleSetupStart}
            onSavePartyEdit={handleSavePartyEdit}
            onClose={world ? () => setMenuOpen(false) : undefined}
          />
        )}

        {world && !menuOpen && (
          <div className="game-topbar">
            <div className="topbar-party-block" style={{ borderLeftColor: playerParty?.colour ?? '#888' }}>
              {playerParty && (
                <>
                  <div className="party-initials-badge" style={{ background: playerParty.colour }}>
                    {playerParty.leader.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <strong>{playerParty.name}</strong>
                    <small>{playerParty.leader} · {playerSeats} seat{playerSeats !== 1 ? 's' : ''}{seatsNeeded > 0 ? ` · need ${seatsNeeded} more` : ' · MAJORITY!'}</small>
                  </div>
                </>
              )}
            </div>

            <div className="topbar-ap-block">
              <span className="ap-label-small">AP</span>
              <div className="ap-pips-small">
                {Array.from({ length: world.maxActionPoints }).map((_, i) => (
                  <span key={i} className={`ap-pip-small${i < world.playerActionPoints ? ' filled' : ''}`} />
                ))}
              </div>
              <span className="ap-count-small">{world.playerActionPoints}/{world.maxActionPoints}</span>
            </div>

            <div className={`topbar-countdown${electionIn <= 4 ? ' urgent' : ''}`}>
              <span className="countdown-number">{electionIn}</span>
              <span className="countdown-label">week{electionIn !== 1 ? 's' : ''} to election</span>
            </div>

            <div className="topbar-actions">
              <button className="ink-button secondary small" type="button" onClick={() => setMenuOpen(true)}>Menu</button>
              <button className="ink-button secondary small save-btn" type="button" onClick={handleSave} title="Save game">
                {'\uD83D\uDCBE'}
              </button>
              <button className="ink-button advance-week-btn" type="button" onClick={advanceWeek}>
                Advance Week {'\u2192'}
              </button>
            </div>
          </div>
        )}

        <div className="dashboard-layout">
          {world ? (
            <>
              <div className="seat-bar-row">
                <SeatBar world={world} onOpenStats={() => setShowStatsModal(true)} onOpenDashboard={() => setShowGovDashboard(true)} />
              </div>

              <section className="panel map-panel">
                <div className="map-panel-header">
                  <div>
                    <div className="panel-kicker">Campaign Map</div>
                    <h3>{world.townName}</h3>
                  </div>
                  <div className="map-mode-row">
                    {(['ward', 'bloc', 'voter', 'redistrict'] as MapMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`mode-btn${mode === mapMode ? ' is-active' : ''}`}
                        onClick={() => {
                          if (mode === 'redistrict') handleStartRedistrict()
                          else setMapMode(mode)
                        }}
                      >
                        {mode === 'ward' ? 'Wards' : mode === 'bloc' ? 'Blocs' : mode === 'voter' ? 'Clusters' : 'Redistrict'}
                      </button>
                    ))}
                  </div>
                </div>

                {mapMode === 'redistrict' && (
                  <div className="redistrict-toolbar">
                    <div className="redistrict-disclaimer">
                      Sandbox redistricting — boundaries will not be fair. Drag the seed points to reshape wards. Tile assignments update automatically.
                    </div>
                    <div className="redistrict-controls">
                      <button
                        className="ink-button secondary small"
                        type="button"
                        onClick={handleCancelRedistrict}
                      >
                        Reset
                      </button>
                      <button
                        className="ink-button small"
                        type="button"
                        onClick={handleDoneRedistrict}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}

                <div className="currents-strip">
                  {world.currents.map((current, i) => (
                    <span key={`${current.id}-${i}`} className="current-pill">
                      <span className="current-dot" />
                      {current.label}
                    </span>
                  ))}
                </div>

                <MapFigure
                  world={world}
                  mapMode={mapMode}
                  selectedConstituencyId={selectedConstituencyId}
                  selectedBlocId={selectedBlocId}
                  selectedTileId={selectedTileId}
                  blocColours={blocColours}
                  tilePreferenceById={tilePreferenceById}
                  onSelectConstituency={setSelectedConstituencyId}
                  onSelectBloc={setSelectedBlocId}
                  onSelectTile={focusTile}
                  redistrictTargetWardId={mapMode === 'redistrict' ? redistrictTargetWardId : undefined}
                  onSetRedistrictTarget={mapMode === 'redistrict' ? setRedistrictTargetWardId : undefined}
                  onDragRedistrictSeeds={mapMode === 'redistrict' ? handleDragSeeds : undefined}
                />
              </section>

              <div className="right-column">
                <section className="panel campaign-panel-wrap">
                  <div className="panel-kicker">Campaign</div>
                  <CampaignActionsPanel
                    world={world}
                    selectedWardId={selectedConstituencyId}
                    onAction={handleAction}
                    onTogglePermanent={handleTogglePermanent}
                    onAcceptNpcProposal={() => {
                      if (!world?.pendingNpcProposal) return
                      const p = world.pendingNpcProposal
                      setWorld({ ...world, pendingNpcProposal: undefined, alliancePacts: [...world.alliancePacts, { ...p }] })
                    }}
                    onRejectNpcProposal={() => {
                      if (!world?.pendingNpcProposal) return
                      const p = world.pendingNpcProposal
                      const npcId = p.partyAId === world.playerPartyId ? p.partyBId : p.partyAId
                      const repKey = [world.playerPartyId, npcId].sort().join('_')
                      setWorld({
                        ...world,
                        pendingNpcProposal: undefined,
                        allianceReputation: { ...world.allianceReputation, [repKey]: (world.allianceReputation[repKey] ?? 0) + 0.15 },
                      })
                    }}
                  />
                </section>

                <ConstituencyInspector
                  world={world}
                  constituency={selectedConstituency}
                  mapMode={mapMode}
                  selectedBlocId={selectedBlocId}
                  selectedTile={selectedTile as PopulationTile | undefined}
                  selectedTileEstimate={selectedTileEstimate}
                />
              </div>
            </>
          ) : (
            <section className="panel empty-panel">
              <h2>The presses await.</h2>
              <p>Open the menu, set your ward count, and start a fresh race.</p>
            </section>
          )}
        </div>
      </main>

      {lastActionResult && (
        <ActionFlash result={lastActionResult} onDismiss={() => setLastActionResult(null)} />
      )}

      {showStatsModal && world && (
        <StatisticsModal
          world={world}
          previousNationalById={previousNationalById}
          onClose={() => setShowStatsModal(false)}
        />
      )}

      {showElectionNight && world && (
        <ElectionNightModal
          world={world}
          onReveal={() => setWorld((w) => w ? { ...w, electionNightRevealIndex: Math.min(w.electionNightRevealIndex + 1, w.electionNightResults.length) } : w)}
          onClose={() => {
            setShowElectionNight(false)
            const w = world
            if (!w) return
            if (w.isGoverning) {
              const decisions = generateGovernanceDecisions(2)
              setWorld({ ...w, governanceDecisions: decisions, electionNightActive: false, playerLost: false })
              setShowGovernance(true)
            } else if (w.needsCoalition) {
              setShowCoalitionModal(true)
              setWorld({ ...w, electionNightActive: false, playerLost: false })
            } else {
              setWorld({ ...w, electionNightActive: false, playerLost: false })
            }
          }}
        />
      )}

      {showCoalitionModal && world && (
        <CoalitionModal
          world={world}
          onFormCoalition={(partnerId, decisions) => {
            setWorld((prev) => prev ? { ...prev, coalitionPartnerId: partnerId, governanceDecisions: decisions, needsCoalition: false } : prev)
            setShowCoalitionModal(false)
            setShowGovernance(true)
          }}
          onFormMinority={(decisions) => {
            setWorld((prev) => prev ? { ...prev, minorityGovernment: true, governanceDecisions: decisions, needsCoalition: false } : prev)
            setShowCoalitionModal(false)
            setShowGovernance(true)
          }}
          onOpposition={() => {
            setWorld((prev) => prev ? { ...prev, needsCoalition: false } : prev)
            setShowCoalitionModal(false)
          }}
        />
      )}

      {showGovernance && world && (
        <GovernanceModal
          world={world}
          decisions={world.governanceDecisions}
          onDecide={handleGovernanceDecision}
          onClose={() => setShowGovernance(false)}
        />
      )}

      {showBudgetModal && world?.budget && (
        <BudgetModal
          budget={world.budget}
          onSave={(b) => {
            setWorld((prev) => prev ? { ...prev, budget: b } : prev)
            setShowBudgetModal(false)
          }}
          onClose={() => setShowBudgetModal(false)}
        />
      )}

      {showGovDashboard && world && (
        <GovernmentDashboard
          world={world}
          onOpenBudget={() => {
            setShowGovDashboard(false)
            setShowBudgetModal(true)
          }}
          onClose={() => setShowGovDashboard(false)}
        />
      )}
    </div>
  )
}

export default App
