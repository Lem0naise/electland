import { useCallback, useEffect, useMemo, useState } from 'react'
import { Delaunay } from 'd3-delaunay'

import './App.css'
import { ConstituencyInspector } from './components/ConstituencyInspector'
import { MapFigure } from './components/MapFigure'
import { StatisticsModal } from './components/StatisticsModal'
import { CoalitionModal } from './components/CoalitionModal'
import { BudgetModal } from './components/BudgetModal'
import { ElectionNightModal } from './components/ElectionNightModal'
import { ActionFlash } from './components/ActionFlash'
import { PactsPanel } from './components/PactsPanel'
import { WardPactNegotiator } from './components/WardPactNegotiator'
import { PoliticianActionsPanel } from './components/PoliticianActionsPanel'
import { CouncilChamber, ProposalForm } from './components/CouncilChamber'
import { RelationshipsPanel } from './components/RelationshipsPanel'
import { CareerTracker } from './components/CareerTracker'
import { CouncilComposition } from './components/CouncilComposition'
import { WardSwitchModal } from './components/WardSwitchModal'
import { CurrentPollingPanel } from './components/CurrentPollingPanel'
import { WorkspaceTabs, type WorkspaceTab } from './components/WorkspaceTabs'
import { CouncilLegislationRegister } from './components/CouncilLegislationRegister'
import { SeatBar } from './components/SeatBar'
import { SetupScreen } from './components/SetupScreen'
import { formatAxis } from './lib/format'
import { saveGame, loadGame, hasSave, exportSaveGame, importSaveGame } from './lib/persistence'
import {
  applyCampaignAction,
  applyRelationshipAction,
  applyPartyEdits,
  applyPoliticianAction,
  budgetIdeologyLean,
  calculateResults,
  castPlayerVote,
  dominantBlocId,
  lobbyCouncillor,
  promoteCareer,
  queueCustomMotion,
  queueRepealMotion,
  estimateTilePreference,
  formNpcOpposition,
  generateCouncilSession,
  generateGovernanceDecisions,
  generateWorld,
  governingStatusLabel,
  MOTION_PROPOSAL_INFLUENCE_COST,
  playerCanNegotiateCoalition,
  recalculateWardAggregates,
  redistributeSnapshot,
  regenerateCellPaths,
  resolveCouncilSession,
  requestWardSwitch,
  restoreRedistributeSnapshot,
  shouldTriggerCouncilSession,
  simulateWeek,
  type PoliticianActionResult,
} from './lib/sim'
import {
  formCoalitionGovernment,
  formMinorityGovernment,
  isPlayerPartyGovernmentLead,
} from './sim/politics/government'
import type {
  ActionResult,
  CampaignAction,
  MapMode,
  PartyEdit,
  PartyPerformance,
  PoliticianActionMeta,
  PopulationTile,
  World,
} from './types/sim'

const blocPalette = ['#d94841', '#00798c', '#edae49', '#3d405b', '#81b29a', '#8d5524', '#c56b37']

function playerPartySeats(world: World) {
  return world.nationalResults.find((r) => r.partyId === world.playerPartyId)?.seatsWon ?? 0
}

function newsToast(description: string, outcome: ActionResult['outcome'] = 'neutral'): ActionResult {
  return {
    action: { type: 'canvass', label: '', description: '', apCost: 0 },
    outcome,
    description: description.replace(/^Week \d+:\s*/, ''),
  }
}

function polToFlash(result: PoliticianActionResult): ActionResult {
  return {
    action: { type: 'canvass', label: result.action.label, description: result.action.description, apCost: result.action.apCost },
    outcome: result.outcome,
    description: result.description,
  }
}

function App() {
  const [constituencyCount, setConstituencyCount] = useState(10)
  const [world, setWorld] = useState<World | null>(null)
  const [previousNationalResults, setPreviousNationalResults] = useState<PartyPerformance[] | null>(null)
  const [selectedConstituencyId, setSelectedConstituencyId] = useState('')
  const [selectedBlocId, setSelectedBlocId] = useState('')
  const [selectedTileId, setSelectedTileId] = useState('')
  const [mapMode, setMapMode] = useState<MapMode>('ward')
  const [menuOpen, setMenuOpen] = useState(true)
  const [lastActionResult, setLastActionResult] = useState<ActionResult | null>(null)
  const [lastPolResult, setLastPolResult] = useState<PoliticianActionResult | null>(null)
  const [showElectionNight, setShowElectionNight] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showCoalitionModal, setShowCoalitionModal] = useState(false)
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [polElectionOutcome, setPolElectionOutcome] = useState<'won' | 'lost' | null>(null)
  const [showCouncilChamber, setShowCouncilChamber] = useState(false)
  const [showMotionComposer, setShowMotionComposer] = useState(false)
  const [repealTargetId, setRepealTargetId] = useState<string | null>(null)
  const [budgetEditorMode, setBudgetEditorMode] = useState<'propose' | 'amend' | null>(null)
  const [showWardSwitchModal, setShowWardSwitchModal] = useState(false)
  const [wardNominationDismissed, setWardNominationDismissed] = useState(false)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('campaign')
  const [mapFocus, setMapFocus] = useState(false)
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

  const playerParty = world?.parties.find((party) => party.id === world.playerPartyId)

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
    const pol = world?.politicianMode?.politician
    if (pol && !pol.wardId && world.weeksUntilElection <= 4 && !wardNominationDismissed) {
      setShowWardSwitchModal(true)
    }
  }, [wardNominationDismissed, world?.politicianMode?.politician, world?.weeksUntilElection])

  useEffect(() => {
    setWardNominationDismissed(false)
  }, [world?.seed])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showStatsModal) { setShowStatsModal(false); return }
      if (showBudgetModal) { setShowBudgetModal(false); return }
      if (menuOpen && world) { setMenuOpen(false); return }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [showStatsModal, showBudgetModal, menuOpen, world])

  const handleSetupStart = useCallback((seed?: number, playerPartyIdArg?: string, edits?: PartyEdit[], playerName?: string) => {
    const needsRegeneration = seed !== undefined
    if (needsRegeneration) {
      const nextWorld = generateWorld({ seed, constituencyCount, customParties: [], partyEdits: edits, playerPartyId: playerPartyIdArg, gameMode: 'single-politician', playerName })
      setPreviousNationalResults(null)
      setWorld(nextWorld)
      setShowElectionNight(false)
      setLastActionResult(null)
      const polWardId = nextWorld.politicianMode?.politician.wardId
      const firstWardId = polWardId ?? nextWorld.constituencies[0]?.id ?? ''
      setSelectedConstituencyId(firstWardId)
      setSelectedBlocId(dominantBlocId(nextWorld.constituencies.find((c) => c.id === firstWardId)?.blocMix ?? {}))
      setSelectedTileId(nextWorld.tiles.find((t) => t.constituencyId === firstWardId)?.id ?? '')
    } else {
      setWorld((prev) => {
        if (!prev) return prev
        let next = prev
        if (edits && edits.length > 0) next = applyPartyEdits(next, edits)
        if (playerPartyIdArg && playerPartyIdArg !== next.playerPartyId) {
          next = { ...next, playerPartyId: playerPartyIdArg }
        }
        return next
      })
    }
    setMenuOpen(false)
    setActiveWorkspaceTab('campaign')
  }, [constituencyCount])

  const advanceWeek = useCallback(() => {
    if (!world) return
    setPreviousNationalResults(world.nationalResults)
    let nextWorld = simulateWeek(world)
    if (shouldTriggerCouncilSession(nextWorld)) {
      nextWorld = generateCouncilSession(nextWorld)
      setShowCouncilChamber(true)
      setActiveWorkspaceTab('council')
    }
    const toast = nextWorld.pendingActionToast
    setWorld({ ...nextWorld, pendingActionToast: undefined })
    if (toast) {
      setLastActionResult({
        action: { type: 'canvass', label: '', description: '', apCost: 0 },
        outcome: 'success',
        description: toast,
      })
    } else {
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
  }, [world])

  const handleSave = useCallback(() => {
    if (!world) return
    saveGame(world, previousNationalResults, constituencyCount)
    setLastActionResult({
      action: { type: 'canvass', label: '', description: '', apCost: 0 },
      outcome: 'success',
      description: `Game saved — Week ${world.week}, ${world.townName}`,
    })
  }, [world, previousNationalResults, constituencyCount])

  const handleLoad = () => {
    const result = loadGame()
    if (!result.data) return
    applyLoadedSave(result.data)
  }

  const handleExport = () => {
    if (!world) return
    exportSaveGame(world, previousNationalResults, constituencyCount)
  }

  const handleImport = async () => {
    const data = await importSaveGame()
    if (!data) return
    saveGame(data.world, data.previousNationalResults, data.constituencyCount)
    applyLoadedSave(data)
  }

  const applyLoadedSave = (data: { world: World; previousNationalResults: PartyPerformance[] | null; constituencyCount: number }) => {
    setWorld(data.world)
    setPreviousNationalResults(data.previousNationalResults)
    setConstituencyCount(data.constituencyCount)
    setShowElectionNight(false)
    setLastActionResult(null)
    const wardId = data.world.politicianMode?.politician.wardId || data.world.constituencies[0]?.id || ''
    setSelectedConstituencyId(wardId)
    setSelectedBlocId(dominantBlocId(data.world.constituencies.find((seat) => seat.id === wardId)?.blocMix ?? {}))
    setSelectedTileId(data.world.tiles.find((tile) => tile.constituencyId === wardId)?.id ?? '')
    setMenuOpen(false)
    setActiveWorkspaceTab('campaign')
  }

  const handlePoliticianAction = (action: PoliticianActionMeta) => {
    if (!world) return
    const { world: nextWorld, result } = applyPoliticianAction(world, action)
    setWorld(nextWorld)
    setLastPolResult(result)
    setLastActionResult(polToFlash(result))
  }

  const handleAction = (action: CampaignAction) => {
    if (!world) return
    const { world: nextWorld, result } = applyCampaignAction(world, action)
    setWorld(nextWorld)
    setLastActionResult(result)
  }

  const handleRelationshipAction = (councillorId: string, action: 'reach_out' | 'antagonise') => {
    if (!world) return
    const result = applyRelationshipAction(world, councillorId, action)
    setWorld(result.world)
    setLastPolResult(result.result)
    setLastActionResult(polToFlash(result.result))
  }

  const handleWardSelection = (wardId: string) => {
    if (!world) return
    const result = requestWardSwitch(world, wardId)
    setWorld(result.world)
    const polResult: PoliticianActionResult = {
      action: { type: 'call_party_support', label: 'Ward nomination', description: result.reason, apCost: 0 },
      outcome: result.approved ? 'success' : 'neutral',
      description: result.reason,
    }
    setLastPolResult(polResult)
    setLastActionResult(polToFlash(polResult))
    if (result.approved) {
      setSelectedConstituencyId(wardId)
      setShowWardSwitchModal(false)
      setWardNominationDismissed(false)
    }
  }

  const resolveHungCouncil = (w: World) => {
    if (w.government?.status !== 'forming') return w
    if (playerPartySeats(w) === 0 || !playerCanNegotiateCoalition(w)) {
      const next = formNpcOpposition(w)
      setLastActionResult(newsToast(next.newsFeed[0] ?? 'Government formation resolved.', isPlayerPartyGovernmentLead(next) ? 'success' : 'neutral'))
      return next
    }
    setShowCoalitionModal(true)
    return w
  }

  const afterPersonalElection = (w: World) => {
    if (w.government?.status === 'forming') {
      setWorld(resolveHungCouncil(w))
      return
    }
    if (!isPlayerPartyGovernmentLead(w) && w.nationalResults.some((r) => r.seatsWon >= w.stats.councilMajority && r.partyId !== w.playerPartyId)) {
      const next = formNpcOpposition(w)
      setWorld(next)
      setLastActionResult(newsToast(next.newsFeed[0] ?? 'Another party governs.', 'neutral'))
    }
  }

  const focusTile = (tileId: string) => {
    if (!world) return
    const tile = world.tiles.find((entry) => entry.id === tileId)
    if (!tile) return
    setSelectedTileId(tile.id)
    setSelectedBlocId(dominantBlocId(tile.blocMix))
    if (tile.constituencyId) setSelectedConstituencyId(tile.constituencyId)
    setActiveWorkspaceTab('ward')
  }

  const focusWard = (wardId: string) => {
    setSelectedConstituencyId(wardId)
    setSelectedBlocId(dominantBlocId(world?.constituencies.find((ward) => ward.id === wardId)?.blocMix ?? {}))
    setSelectedTileId(world?.tiles.find((tile) => tile.constituencyId === wardId)?.id ?? '')
    setActiveWorkspaceTab('ward')
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
    const seedMap = new Map(seeds.map((s) => [s.wardId, s]))
    const updatedConstituencies = world.constituencies.map((ward) => {
      const s = seedMap.get(ward.id)
      if (!s) return ward
      return { ...ward, seed: { x: s.x, y: s.y } }
    })
    const points = updatedConstituencies.map((c) => [c.seed.x, c.seed.y] as [number, number])
    const delaunay = Delaunay.from(points)
    const updatedTiles = world.tiles.map((tile) => {
      const idx = delaunay.find(tile.x, tile.y)
      const newId = updatedConstituencies[idx]?.id ?? tile.constituencyId
      return newId !== tile.constituencyId ? { ...tile, constituencyId: newId } : tile
    })
    setWorld({ ...world, constituencies: updatedConstituencies, tiles: updatedTiles })
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

  return (
    <div className="newspaper-shell">
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
            onGenerate={(partyEdits, playerPartyId) => {
              const nextWorld = generateWorld({ seed: Date.now(), constituencyCount, customParties: [], partyEdits, playerPartyId, gameMode: 'single-politician' })
              setPreviousNationalResults(null)
              setWorld(nextWorld)
              setShowElectionNight(false)
              setLastActionResult(null)
              setSelectedConstituencyId(nextWorld.constituencies[0]?.id ?? '')
              setSelectedBlocId(dominantBlocId(nextWorld.constituencies[0]?.blocMix ?? {}))
              setSelectedTileId(nextWorld.tiles.find((t) => t.constituencyId === nextWorld.constituencies[0]?.id)?.id ?? '')
            }}
            onStart={handleSetupStart}
            onClose={world ? () => setMenuOpen(false) : undefined}
          />
        )}

        {world && !menuOpen && (
          <div className="game-topbar command-strip">
            <div className="command-identity" style={{ borderLeftColor: playerParty?.colour ?? '#888' }}>
              <span className="party-initials-badge" style={{ background: playerParty?.colour ?? '#888' }}>
                {(world.politicianMode?.politician.name ?? playerParty?.leader ?? '?').split(' ').map((name) => name[0]).join('')}
              </span>
              <strong>{world.politicianMode ? `Cllr. ${world.politicianMode.politician.name}` : playerParty?.name}</strong>
            </div>
            <div className="command-meta">
              <span>Week {world.week}</span>
              {world.politicianMode?.politician.isIncumbent && <span>{world.politicianMode.politician.influence} influence</span>}
            </div>
            <div className={`topbar-countdown${electionIn <= 4 ? ' urgent' : ''}`} aria-label={electionIn === 0 ? 'Election today' : `${electionIn} weeks until election`}>
              <span className="countdown-number">{electionIn === 0 ? 'NOW' : electionIn}</span>
              <span className="countdown-label">{electionIn === 0 ? 'Election' : 'weeks to election'}</span>
            </div>
      
            <div className="topbar-actions">
              <details className="command-overflow">
                <summary aria-label="Open game utilities">•••</summary>
                <div>
                  <button type="button" onClick={() => setMenuOpen(true)}>Menu</button>
                  <button type="button" onClick={handleSave}>Save game</button>
                </div>
              </details>
              <button className="ink-button advance-week-btn" type="button" onClick={advanceWeek}>Advance Week</button>
            </div>
          </div>
        )}

        <div className="dashboard-layout">
          {world ? (
            <>
              <div className="seat-bar-row">
                <SeatBar world={world} onOpenStats={() => setShowStatsModal(true)} />
              </div>

              <section className={`panel map-panel${mapFocus ? ' is-focused' : ''}`}>
                <div className="map-panel-header">
                  <div>
                    <div className="panel-kicker">Campaign Map</div>
                    <h3>{world.townName}</h3>
                  </div>
                  <div className="map-mode-row">
                    {(['ward', 'bloc', 'voter'] as MapMode[]).map((mode) => (
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
                    <button type="button" className="map-focus-btn" onClick={() => setMapFocus((focused) => !focused)}>
                      {mapFocus ? 'Details focus' : 'Map focus'}
                    </button>
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
                  onSelectConstituency={focusWard}
                  onSelectBloc={setSelectedBlocId}
                  onSelectTile={focusTile}
                  redistrictTargetWardId={mapMode === 'redistrict' ? redistrictTargetWardId : undefined}
                  onSetRedistrictTarget={mapMode === 'redistrict' ? setRedistrictTargetWardId : undefined}
                  onDragRedistrictSeeds={mapMode === 'redistrict' ? handleDragSeeds : undefined}
                />
              </section>

              <div className="right-column">
                <WorkspaceTabs
                  activeTab={activeWorkspaceTab}
                  onChange={setActiveWorkspaceTab}
                  tabs={[
                    { id: 'campaign', label: 'Actions' },
                    { id: 'ward', label: 'Ward' },
                    ...(world.politicianMode ? [{ id: 'political' as const, label: 'Political life' }] : []),
                    ...(world.politicianMode ? [{ id: 'council' as const, label: 'Council', badge: world.politicianMode.politician.isIncumbent && world.politicianMode.currentSession && !world.politicianMode.currentSession.resolved ? '!' : undefined }] : []),
                  ]}
                />
                <div className="workspace-panel">
                  {activeWorkspaceTab === 'campaign' && (
                    <section className="panel campaign-panel-wrap">
                      <div className="panel-kicker">Your actions</div>
                      <PoliticianActionsPanel world={world} onAction={handlePoliticianAction} onToggleAuto={(type) => {
                        if (!world.politicianMode) return
                        const pm = world.politicianMode
                        const autoCampaigns = pm.autoCampaigns[0] === type ? [] : [type]
                        setWorld({ ...world, politicianMode: { ...pm, autoCampaigns } })
                      }} onSetColleagueTarget={(wardId) => {
                        if (!world.politicianMode) return
                        setWorld({ ...world, politicianMode: { ...world.politicianMode, autoColleagueWardId: wardId } })
                      }} lastResult={lastPolResult} />
                    </section>
                  )}
                  {activeWorkspaceTab === 'ward' && (() => {
                    const pol = world.politicianMode?.politician
                    const isLeader = pol?.careerRank === 'party-leader'
                    const isOwnWard = Boolean(pol?.wardId && selectedConstituencyId && pol.wardId === selectedConstituencyId)
                    const canNegotiateWard = Boolean(selectedConstituencyId && (isOwnWard || isLeader))
                    let pactLockHint: string | null = null
                    if (selectedConstituencyId && !canNegotiateWard) {
                      if (!pol?.wardId) {
                        pactLockHint = 'Nominate a ward to negotiate local pacts, or become party leader to negotiate for any ward.'
                      } else {
                        pactLockHint = 'Become party leader to negotiate pacts for wards other than your own.'
                      }
                    }
                    return (
                      <>
                        <CurrentPollingPanel world={world} constituency={selectedConstituency} />
                        {canNegotiateWard && selectedConstituencyId && (
                          <WardPactNegotiator
                            world={world}
                            focusWardId={selectedConstituencyId}
                            onAction={handleAction}
                          />
                        )}
                        {pactLockHint && (
                          <section className="panel ward-pact-locked">
                            <div className="panel-kicker">Electoral pacts</div>
                            <p className="ward-pact-locked-hint">{pactLockHint}</p>
                          </section>
                        )}
                        <ConstituencyInspector world={world} constituency={selectedConstituency} mapMode={mapMode} selectedBlocId={selectedBlocId} selectedTile={selectedTile as PopulationTile | undefined} selectedTileEstimate={selectedTileEstimate} />
                      </>
                    )
                  })()}
                  {activeWorkspaceTab === 'political' && world.politicianMode && (
                    <>
                      <section className="panel personal-position-summary">
                        <div className="panel-kicker">Your personal position</div>
                        <div className="personal-position-values">
                          <span>Reform <strong>{formatAxis(world.politicianMode.politician.personalValues.change)}</strong></span>
                          <span>Business <strong>{formatAxis(world.politicianMode.politician.personalValues.growth)}</strong></span>
                          <span>Services <strong>{formatAxis(world.politicianMode.politician.personalValues.services)}</strong></span>
                        </div>
                        <small>Independent of the party platform · next change week {world.politicianMode.politician.personalPolicyNextWeek}</small>
                      </section>
                      <section className="panel"><div className="panel-kicker">Career</div><CareerTracker world={world} onPromote={() => {
                        const next = promoteCareer(world)
                        setWorld(next)
                        setLastActionResult(newsToast(next.newsFeed[0] ?? 'Promotion accepted.', 'success'))
                      }} /></section>
                      <section className="panel"><div className="panel-kicker">{world.politicianMode.politician.isIncumbent ? 'Council colleagues' : 'Political contacts'}</div><RelationshipsPanel world={world} onRelationshipAction={handleRelationshipAction} lastResult={lastPolResult} /></section>
                      {world.politicianMode.politician.careerRank === 'party-leader' && (
                        <section className="panel">
                          <div className="panel-kicker">Electoral pacts</div>
                          <PactsPanel
                            world={world}
                            onAction={handleAction}
                            onAcceptNpcProposal={() => {
                              if (!world.pendingNpcProposal) return
                              setWorld({ ...world, pendingNpcProposal: undefined, alliancePacts: [...world.alliancePacts, world.pendingNpcProposal] })
                              setLastActionResult(newsToast('You accepted the proposed electoral pact.', 'success'))
                            }}
                            onRejectNpcProposal={() => {
                              if (!world.pendingNpcProposal) return
                              const proposal = world.pendingNpcProposal
                              const npcId = proposal.partyAId === world.playerPartyId ? proposal.partyBId : proposal.partyAId
                              const repKey = [world.playerPartyId, npcId].sort().join('_')
                              setWorld({ ...world, pendingNpcProposal: undefined, allianceReputation: { ...world.allianceReputation, [repKey]: (world.allianceReputation[repKey] ?? 0) + 0.15 } })
                              setLastActionResult(newsToast('You rejected the proposed electoral pact.', 'neutral'))
                            }}
                          />
                        </section>
                      )}
                    </>
                  )}
                  {activeWorkspaceTab === 'council' && world.politicianMode && (() => {
                    const pm = world.politicianMode!
                    const seated = pm.politician.isIncumbent
                    const sessionLive = seated && pm.currentSession && !pm.currentSession.resolved
                    const weeksToOrdinary = Math.max(0, pm.nextSessionWeek - world.week)
                    const weeksToBudget = Math.max(0, pm.nextBudgetWeek - world.week)
                    const budgetSoon = weeksToBudget <= 4 || (sessionLive && pm.currentSession?.budgetSession)
                    const governing = isPlayerPartyGovernmentLead(world)
                    return (
                      <>
                        <CouncilComposition world={world} onChangeWard={() => setShowWardSwitchModal(true)} />
                        <section className={`panel council-workspace-panel${seated ? '' : ' is-locked'}`}>
                          <div className="panel-kicker">Council business</div>
                          {!seated ? (
                            <>
                              <h3>Chamber locked</h3>
                              <p>Win a seat to speak, vote, and propose motions in the council chamber.</p>
                              <p className="council-influence-note">Choose your ward above, then campaign until election night.</p>
                            </>
                          ) : (
                            <>
                              <p className="council-gov-status">{governingStatusLabel(world)}</p>
                              <h3>
                                {sessionLive
                                  ? (pm.currentSession?.budgetSession ? 'Budget session is ready' : 'A council session is ready')
                                  : weeksToOrdinary <= weeksToBudget
                                    ? `Next ordinary session: week ${pm.nextSessionWeek}`
                                    : `Next budget session: week ${pm.nextBudgetWeek}`}
                              </h3>
                              <p>
                                {sessionLive
                                  ? (pm.currentSession?.budgetSession
                                    ? 'Review the budget proposal, lobby colleagues, and cast your vote.'
                                    : 'Review the motion, lobby colleagues, and cast your vote.')
                                  : `Next ordinary: ${weeksToOrdinary} week${weeksToOrdinary === 1 ? '' : 's'} · next budget: ${weeksToBudget} week${weeksToBudget === 1 ? '' : 's'}.`}
                              </p>
                              <p className="council-influence-note">Influence: {pm.politician.influence} · proposing costs {MOTION_PROPOSAL_INFLUENCE_COST}</p>
                              {sessionLive && <button type="button" className="ink-button" onClick={() => setShowCouncilChamber(true)}>Open Council Chamber</button>}
                              {governing && budgetSoon && (
                                <button
                                  type="button"
                                  className="ink-button"
                                  onClick={() => { setBudgetEditorMode('propose'); setShowBudgetModal(true) }}
                                >
                                  {pm.proposedBudget ? 'Revise government budget draft' : 'Prepare government budget draft'}
                                </button>
                              )}
                              {!governing && budgetSoon && (
                                <button
                                  type="button"
                                  className="ink-button secondary"
                                  onClick={() => { setBudgetEditorMode('amend'); setShowBudgetModal(true) }}
                                >
                                  Propose budget amendment (10 influence)
                                </button>
                              )}
                              {(!pm.currentSession || pm.currentSession.resolved) && !pm.queuedMotion && pm.politician.influence >= MOTION_PROPOSAL_INFLUENCE_COST && (
                                <button type="button" className="ink-button secondary" onClick={() => { setRepealTargetId(null); setShowMotionComposer(true) }}>
                                  Propose a Motion ({MOTION_PROPOSAL_INFLUENCE_COST} influence)
                                </button>
                              )}
                              {(!pm.currentSession || pm.currentSession.resolved) && !pm.queuedMotion && pm.politician.influence < MOTION_PROPOSAL_INFLUENCE_COST && (
                                <p className="council-influence-note">Need {MOTION_PROPOSAL_INFLUENCE_COST} influence to queue a motion (you have {pm.politician.influence}).</p>
                              )}
                              {pm.queuedMotion && <p className="council-queued-motion">Queued for next session: <strong>{pm.queuedMotion.headline}</strong> · remaining influence {pm.politician.influence}</p>}
                            </>
                          )}
                        </section>
                        <section className={`panel${seated ? '' : ' is-locked'}`}>
                          <CouncilLegislationRegister
                            motions={pm.legislationHistory}
                            canRepeal={seated && !pm.queuedMotion && pm.politician.influence >= MOTION_PROPOSAL_INFLUENCE_COST && (!pm.currentSession || pm.currentSession.resolved)}
                            onRepeal={(motionId) => {
                              setRepealTargetId(motionId)
                              setShowMotionComposer(true)
                            }}
                          />
                        </section>
                      </>
                    )
                  })()}
                </div>
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
            if (w.politicianMode) {
              const won = w.politicianMode.politician.isIncumbent
              setPolElectionOutcome(won ? 'won' : 'lost')
              setWorld({ ...w, electionNightActive: false })
            } else if (isPlayerPartyGovernmentLead(w)) {
              const decisions = generateGovernanceDecisions(2)
              setWorld({ ...w, governanceDecisions: decisions, electionNightActive: false })
            } else if (w.government?.status === 'forming') {
              const resolved = resolveHungCouncil(w)
              setWorld({ ...resolved, electionNightActive: false })
            } else {
              setWorld({ ...w, electionNightActive: false })
            }
          }}
        />
      )}

      {showCoalitionModal && world && (
        <CoalitionModal
          world={world}
          onFormCoalition={(partnerId, decisions) => {
            setWorld((prev) => {
              if (!prev) return prev
              const next = { ...formCoalitionGovernment(prev, prev.playerPartyId, [partnerId]), governanceDecisions: decisions }
              setLastActionResult(newsToast(next.newsFeed[0] ?? 'Coalition formed.', 'success'))
              return next
            })
            setShowCoalitionModal(false)
          }}
          onFormMinority={(decisions) => {
            setWorld((prev) => {
              if (!prev) return prev
              const next = { ...formMinorityGovernment(prev, prev.playerPartyId), governanceDecisions: decisions }
              setLastActionResult(newsToast(next.newsFeed[0] ?? 'Minority government formed.', 'success'))
              return next
            })
            setShowCoalitionModal(false)
          }}
          onOpposition={() => {
            setWorld((prev) => {
              if (!prev) return prev
              const next = formNpcOpposition(prev)
              setLastActionResult(newsToast(next.newsFeed[0] ?? 'You go into opposition.', 'neutral'))
              return next
            })
            setShowCoalitionModal(false)
          }}
        />
      )}

      {showBudgetModal && world?.budget && (
        <BudgetModal
          budget={world.politicianMode?.proposedBudget ?? world.budget}
          saveLabel={budgetEditorMode === 'amend' ? 'Queue Budget Amendment' : budgetEditorMode === 'propose' ? 'Table Government Draft' : 'Approve Budget'}
          onSave={(b) => {
            setWorld((prev) => {
              if (!prev) return prev
              if (prev.politicianMode && budgetEditorMode === 'amend') {
                return queueCustomMotion(prev, {
                  headline: 'Opposition budget amendment',
                  description: 'An alternative balanced allocation tabled by the opposition.',
                  category: 'budget',
                  ideologyLean: budgetIdeologyLean(b),
                  kind: 'budget',
                  costSignal: 0.55,
                  budgetProposal: b,
                })
              }
              if (prev.politicianMode && isPlayerPartyGovernmentLead(prev) && (budgetEditorMode === 'propose' || budgetEditorMode === null)) {
                return {
                  ...prev,
                  politicianMode: { ...prev.politicianMode, proposedBudget: b },
                  newsFeed: [`Week ${prev.week}: Government tables its budget draft.`, ...prev.newsFeed].slice(0, 30),
                }
              }
              return { ...prev, budget: b }
            })
            setBudgetEditorMode(null)
            setShowBudgetModal(false)
          }}
          onClose={() => { setBudgetEditorMode(null); setShowBudgetModal(false) }}
        />
      )}

      {showCouncilChamber && world?.politicianMode?.currentSession && (
        <CouncilChamber
          world={world}
          onVote={(motionId, vote) => {
            setWorld(castPlayerVote(world, motionId, vote))
          }}
          onResolve={() => {
            if (world.politicianMode?.currentSession?.resolved) {
              setShowCouncilChamber(false)
            } else {
              setWorld(resolveCouncilSession(world))
            }
          }}
          onLobby={(councillorId, motionId, desiredVote) => {
            const result = lobbyCouncillor(world, councillorId, motionId, desiredVote)
            setWorld(result.world)
            setLastPolResult({ action: { type: 'lobby_councillor', label: 'Lobby', description: result.message, apCost: 0 }, outcome: result.success ? 'success' : 'neutral', description: result.message })
            setLastActionResult(newsToast(result.message, result.success ? 'success' : 'neutral'))
          }}
        />
      )}

      {showMotionComposer && world?.politicianMode && (() => {
        const target = repealTargetId
          ? world.politicianMode.legislationHistory.find((motion) => motion.id === repealTargetId)
          : undefined
        const initial = target
          ? {
              headline: `Repeal: ${target.headline}`,
              description: '',
              category: target.category,
              ideologyLean: {
                change: -(target.ideologyLean.change ?? 0),
                growth: -(target.ideologyLean.growth ?? 0),
                services: -(target.ideologyLean.services ?? 0),
              },
              kind: 'repeal' as const,
              targetMotionId: target.id,
              costSignal: Math.min(1, (target.costSignal ?? 0.5) + 0.2),
            }
          : undefined
        return (
          <div className="modal-backdrop">
            <div className="modal motion-composer-modal" role="dialog" aria-modal="true" aria-label={target ? 'Propose a repeal' : 'Propose a motion'}>
              <ProposalForm
                world={world}
                initial={initial}
                submitLabel={target
                  ? `Queue Repeal (−${MOTION_PROPOSAL_INFLUENCE_COST} influence)`
                  : `Queue for Next Session (−${MOTION_PROPOSAL_INFLUENCE_COST} influence)`}
                onSubmit={(input) => {
                  if (target) {
                    setWorld(queueRepealMotion(world, target.id, input.description))
                  } else {
                    setWorld(queueCustomMotion(world, input))
                  }
                  setRepealTargetId(null)
                  setShowMotionComposer(false)
                }}
                onCancel={() => { setRepealTargetId(null); setShowMotionComposer(false) }}
              />
            </div>
          </div>
        )
      })()}

      {showWardSwitchModal && world?.politicianMode && (
        <WardSwitchModal
          world={world}
          onSelect={handleWardSelection}
          onClose={() => { setShowWardSwitchModal(false); setWardNominationDismissed(true) }}
        />
      )}

      {polElectionOutcome && world?.politicianMode && (
        <div className="modal-backdrop">
          <div className="modal pol-outcome-modal" role="dialog" aria-modal="true">
            <h2>{polElectionOutcome === 'won' ? 'You Won Your Seat!' : 'You Lost Your Seat'}</h2>
            {polElectionOutcome === 'won' ? (
              <>
                <p>Congratulations, Cllr. {world.politicianMode.politician.name}! You have been elected to represent <strong>{world.constituencies.find((c) => c.id === world.politicianMode!.politician.wardId)?.name}</strong>.</p>
                <p>Term {world.politicianMode.politician.termsServed} begins. The council chamber awaits.</p>
                <button type="button" className="ink-button" onClick={() => {
                  setPolElectionOutcome(null)
                  afterPersonalElection(world)
                }}>
                  Take Your Seat
                </button>
              </>
            ) : (
              <>
                <p>The voters of <strong>{world.constituencies.find((c) => c.id === world.politicianMode!.politician.wardId)?.name}</strong> have chosen someone else. You remain active in local politics and can build towards the next election.</p>
                <div className="pol-outcome-actions">
                  <button type="button" className="ink-button" onClick={() => {
                    setPolElectionOutcome(null)
                    afterPersonalElection(world)
                  }}>
                    Continue as Challenger
                  </button>
                  <button type="button" className="ink-button secondary" onClick={() => {
                    setPolElectionOutcome(null)
                    setShowWardSwitchModal(true)
                    afterPersonalElection(world)
                  }}>
                    Choose a Different Ward
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
