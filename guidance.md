# AI Agent Guidance: Electland Election Simulator

## Project Overview
Electland is a procedural election simulator for local town council races. Fictional towns, demographic blocs, political parties, and wards are generated. The simulation runs week-by-week. Player runs a campaign: canvass, run ads, hold rallies, smear opponents, form alliance pacts, gerrymander boundaries, and negotiate coalition governments after elections.

## Files

### Core Logic (`src/lib/sim.ts` — ~3600 lines)

| Function | Purpose |
|----------|---------|
| `generateWorld` | Creates town, landmass, settlement centers, population tiles, constituencies, parties |
| `simulateWeek` | Advances time: evolves currents, drifts tiles, evolves parties, runs AI campaigns, calculates results, handles elections |
| `calculateResults` | Softmax-based vote counting per tile, aggregated per ward. Exported. |
| `scorePartyForTile` | Core scorer: wardFit + focus + organization + tagBonus + issueFit + eventBonus + baseUtility + momentum + wardBoost + tileBoost + incumbencyBonus |
| `estimateTilePreference` | Calls scorePartyForTile + allianceModifier, returns softmax rankings |
| `allianceModifier` | Per-tile: checks alliance pacts, applies standing-down (-999) and endorsement bonuses |
| `evaluateAllianceAcceptance` | AI acceptance formula: target hopeless score + initiator close + ideology - reputation - winning penalty - incumbency |
| `deterministicAcceptance` | Same-pact-same-result within a week. Uses hash of seed+week+party+ward IDs. Adds multi-ward bonus (+0.05 per extra) |
| `suggestPacts` | Ranks all ward pairs for an ally. Returns top 50 with acceptance, breakdown, flip info |
| `reciprocalWards` | Given ally stands down in ward X, returns top 4 player wards to offer in return |
| `beneficiaryParties` | Given player stands down in a ward, returns top 5 parties that benefit |
| `coalitionCompatibility` | Ideology match 0-100% based on valueDistance |
| `generateGovernanceDecisions` | Picks N random governance decisions from the pool |
| `applyCampaignAction` | Processes player actions: canvass, ads, rally, smear, policy_shift, propose_alliance, break_alliance, etc. |
| `recalculateWardAggregates` | Recomputes ward stats from current tile assignments (for redistricting) |
| `regenerateCellPaths` | Rebuilds Voronoi cell paths from ward centroids |
| `redistributeSnapshot` / `restoreRedistributeSnapshot` | Save/restore tile assignments for redistricting undo |
| `loadCouncillorTenure` / `updateCouncillorTenure` | localStorage councillor tenure tracking across elections |
| `strategyTagsForValues` | Derives focus tags from party values (exported) |
| `dominantBlocId` | Finds dominant demographic bloc in a mix (exported) |
| `getAvailableActions` | Builds list of campaign actions available to player |

**Key scoring scale:** Scores are in the range -0.5 to +2.5. A +0.20 shift translates to roughly +5% vote share. Standing-down parties get score -999 (effectively zero in softmax).

### Types (`src/types/sim.ts` — ~400 lines)
All interfaces: `World`, `Constituency`, `PartyDefinition`, `PoliticalValues`, `PopulationTile`, `AlliancePact`, `CampaignAction`, `GovernanceDecision`, `CouncillorTenure`, `PartyEdit`, `MapMode`, `PactSuggestion`, etc.

`PoliticalValues` (change, growth, services) is the 3-axis ideological space. Values range -100 to +100.

### Persistence (`src/lib/persistence.ts`)
Save/load to localStorage (`electland_save` key). Export/import as JSON files.

### UI Components (`src/components/` — 12 files)

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Top-level state: world, menu, modals. All handlers defined here. |
| `SeatBar.tsx` | Horizontal council seat bar. Opens `StatisticsModal` on click. |
| `MapFigure.tsx` | SVG map with ward/bloc/voter/redistrict modes. Drag seeds to gerrymander. |
| `CampaignActionsPanel.tsx` | Campaign UI: event cards, ward poll, action cards, auto-campaigns, alliance proposals (pact builder), NPC proposals, active pacts display |
| `ConstituencyInspector.tsx` | Ward detail: demographics, ideology fit, history, campaign activity |
| `StatisticsModal.tsx` | Full-screen stats: standings, trends, closest/safest seats, vote history chart, party detail, councillor turnover, longest serving |
| `ElectionNightModal.tsx` | Click-to-reveal election results, seat comparison, copy results |
| `CoalitionModal.tsx` | Post-election: invite/accept coalition, minority government, opposition |
| `GovernanceModal.tsx` | Council decisions during governing phase |
| `SetupScreen.tsx` | Town generation, ward count, party picker/editor, UK names button, load game |
| `ActionFlash.tsx` | Toast notification for action results |
| `VoteHistoryChart.tsx` | SVG sparkline chart for vote share over time |
| `IdeologyWidget.tsx` | Three-bar position graphic for party/ward values |

### Styling
`src/App.css` (~66KB) — newspaper aesthetic with serif fonts, ink-style buttons. Key mobile breakpoints at 720px and 900px.

## Alliance System Architecture

### Data flow
1. Pact created → stored in `world.alliancePacts` with `playerEndorsementValue` and `allyEndorsementValue` (standing-down party's pre-pact vote shares)
2. `allianceModifier` (called per-tile in `estimateTilePreference`):
   - Standing-down party → score = -999 (removed from ballot)
   - Receiving party → endorsement bonus = stored_value × 0.01
3. Unilateral pacts (`standingDownIn === allyStandsDownIn`): only initiator stands down, ally gets free endorsement

### Acceptance
- `evaluateAllianceAcceptance`: target hopeless + initiator close + ideology × 0.25 - reputation - winning penalty (share/leaderShare × 0.40) - incumbency (-0.70)
- `deterministicAcceptance`: uses hash-based seed for stable results within a week. Adds +0.05 per extra ward in batch
- UI shows ✓/✗ per ward pair (not percentages)

### Pact builder UI
Single-page two-column layout: "They stand down in" (left) + "You stand down in return" (right). Checkboxes on both sides. Live acceptance bar shows how many combinations will accept. Auto-suggest buttons. Rejected pairs listed with breakdown.

### NPC pacts
- 5% chance per NPC party per week to propose (no AP cost)
- NPC-to-player proposals shown as gold-bordered prompt with Accept/Reject
- Pacts reviewed every 4 weeks: break if standing-down party is now leading comfortably (>20pt margin)

### Pact lifecycle
- Pacts persist across elections (no auto-expiry)
- Player can break any pact (0 AP, reputation penalty)
- NPCs only break via periodic review

## Coalition Government

After elections with No Overall Control, `CoalitionModal` opens:
- If player is largest party: propose to others
- If player is not largest: receive invitation from largest party
- Coalition: 2 governance decisions, partner's utility affected
- Minority: 1 decision, -0.03 utility penalty
- Opposition: no governance
- `blocEffects` on governance decisions applied to coalition partner's baseUtility

## Redistricting

Map mode 'redistrict': drag Voronoi seed points to reshape wards. Tiles reassigned to nearest seed on drop. Done recalcs aggregates, regenerates cellPaths, re-runs calculateResults. Reset restores original boundaries from snapshot.

## Key Constants
- MAP_WIDTH: 920, MAP_HEIGHT: 640, GRID_STEP: 18
- Majority = floor(wardCount/2) + 1
- Player AP: 5 per week, auto-campaign drain cap: 3 AP/week
- Election cycle: 24 weeks (start 8-20 weeks before first election)

## Tech Stack
- React 19 + TypeScript ~5.9 + Vite 8
- d3-delaunay (Voronoi/Delaunay)
- No test framework
- Deployed to GitHub Pages on push to `master`
