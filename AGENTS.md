# AGENTS.md

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck + production build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm install --legacy-peer-deps` — install dependencies (flag required by peer dep conflicts)

There is no test framework configured.

## Verification

Run in this order before committing:
1. `npm run lint`
2. `npm run build`

## Architecture

See `guidance.md` for detailed simulation logic and architecture overview.

### Key files

| File | Lines | Role |
|------|-------|------|
| `src/lib/sim.ts` | ~3500 | Simulation engine — world gen, weekly sim, vote calc, alliances, pacts, redistricting, tenure |
| `src/types/sim.ts` | ~430 | All TypeScript interfaces and types |
| `src/lib/persistence.ts` | ~165 | Save/load with versioned migration, runtime validation, JSON export/import |
| `src/App.tsx` | ~700 | Top-level state, all handlers, layout shell |
| `src/App.css` | ~2700 | All styles (newspaper theme, mobile breakpoints at 720px/900px) |
| `src/components/CampaignActionsPanel.tsx` | ~880 | Campaign UI: actions, pacts, auto-campaigns, NPC proposals, pact builder |
| `src/components/MapFigure.tsx` | ~440 | SVG map: ward/bloc/voter/redistrict modes, seed dragging |
| `src/components/StatisticsModal.tsx` | ~530 | Full-screen stats: standings, trends, party detail, councillor tenure |
| `src/components/SetupScreen.tsx` | ~420 | Town gen, party picker/editor, UK names, load game |
| `src/components/ElectionNightModal.tsx` | ~380 | Election results reveal, copy results, coalition trigger |
| `src/components/CoalitionModal.tsx` | ~250 | Post-election government formation |
| `src/components/ConstituencyInspector.tsx` | ~460 | Ward detail: demographics, fit, history, campaigns |
| `src/components/GovernmentDashboard.tsx` | ~100 | Government period dashboard |
| `src/components/BudgetModal.tsx` | ~100 | Council budget allocation |
| `src/components/GovernanceModal.tsx` | ~60 | Council decisions during governing |
| `src/components/SeatBar.tsx` | ~50 | Horizontal seat bar, opens stats modal |
| `src/components/ActionFlash.tsx` | ~35 | Toast notification (memo-wrapped) |
| `src/components/VoteHistoryChart.tsx` | ~90 | SVG sparkline chart (memo-wrapped) |
| `src/components/IdeologyWidget.tsx` | ~40 | Three-axis position graphic (memo-wrapped) |

## Key systems to know

### Simulation constants (`src/lib/sim.ts` top)
- `ISSUE_FIT_SCALE = 7000` — ideological distance divisor in `scorePartyForTile`
- `ALLIANCE_IDEOLOGY_SCALE = 8000` — ideology divisor for alliance acceptance
- `COALITION_IDEOLOGY_SCALE = 12000` — ideology divisor for coalition compatibility
- `SOFTMAX_TEMP = 0.85` — softmax temperature for vote share calculation
- `STANDING_DOWN_SCORE = -999` — sentinel score for parties standing down
- `WARD_BOOST_DECAY = 0.78` — weekly decay rate for ward campaign boosts
- `CAMPAIGN_BOOST_DECAY = 0.78` — weekly decay rate for tile campaign boosts

### Alliance pacts
- Created via `applyCampaignAction` case `'propose_alliance'`
- Scored per-tile in `allianceModifier()`: standing-down party gets `STANDING_DOWN_SCORE`, ally gets endorsement bonus = stored share × 0.01
- Acceptance via `evaluateAllianceAcceptance()` and `deterministicAcceptance()` (hash-based using ward IDs, stable within a week)
- `suggestPacts()` returns ranked ward pairs with breakdown and acceptance info
- NPC pacts: 5% per party per week in `runAICampaigns()`, reviewed every 4 weeks
- Pacts persist across elections
- All pact/entry IDs are deterministic from `world.seed + world.week` (no `Date.now()`)

### Coalition government
- Post-election NOC triggers `CoalitionModal`
- `coalitionCompatibility()` scores ideology match 0-100% using `COALITION_IDEOLOGY_SCALE`
- `generateGovernanceDecisions(n)` picks governance decisions (Fisher-Yates shuffle)
- `blocEffects` applied to coalition partner's utility

### Voting
- `scorePartyForTile()`: wardFit + focus + organization + tagBonus + issueFit + eventBonus + baseUtility + momentum + wardBoost + tileBoost + incumbencyBonus
- Softmax over scores gives vote shares. Score range roughly -0.5 to +2.5
- +0.20 score shift ≈ +5% vote share gain
- `campaignBoosts` decay weekly (rate `CAMPAIGN_BOOST_DECAY`), preventing permanent stacking
- Custom-tier parties receive `'minor'`-targeted popularity currents

### Redistricting
- Map mode `'redistrict'`: drag Voronoi seed points to gerrymander
- Tile reassignment uses Delaunay (computed immutably in App.tsx, not mutated in MapFigure)
- `recalculateWardAggregates()` + `regenerateCellPaths()` + `calculateResults()` on Done
- Snapshot save/restore for undo

### Persistence (`src/lib/persistence.ts`)
- Save format version: 2 (auto-migrates from v1)
- Stores `previousNationalResults` (not full previous World) to reduce size
- `loadGame()` returns `{ data } | { error }` for user feedback
- `saveGame()` returns `{ ok, error? }`
- `validateWorld()` checks structural integrity on load
- `normalizeSave()` fills missing fields with defaults on migration
- `hasSave()` validates structure, not just key existence

### Councillor tenure
- `loadCouncillorTenure()` / `updateCouncillorTenure()` — localStorage persistence
- Displayed in StatisticsModal

## Type system notes

- `CampaignActionType` — all action types (11 variants)
- `PermanentCampaignType` — narrowed to `'canvass' | 'ads' | 'fix_potholes' | 'improve_bins'`
- `ActiveCampaign.type` uses `PermanentCampaignType` (not full action type)
- `World.budget` is required (not optional)
- `World` does NOT have: `name`, `headlines`, `playerWon`, `playerLost`
- `TownStats` does NOT have: `currentMayorParty`, `currentMayorLeader`, `electionCycleWeeks`, `weeksUntilElection` (use `World.*` directly)

## UI conventions
- Newspaper theme: serif fonts, var(--ink) color palette, var(--paper) backgrounds
- Inline action cards with `.ac-expand-toggle` pattern for config panels
- Modals use `.modal-backdrop` + `.modal` classes with `role="dialog" aria-modal="true"`
- Mobile: `@media (max-width: 720px)` for game UI, `@media (max-width: 900px)` for stats modal
- `prefers-reduced-motion` support: all animations disabled
- `:focus-visible` global outline ring for keyboard users
- Success/positive color: `var(--safe)` (do NOT hardcode hex greens)
- Dismissable modals close on Escape key (stats, budget, gov dashboard, menu)

## Conventions
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters` — no dead code allowed
- No comments in code unless requested
- All RNG must be deterministic: use `createRng(seed)` or `shuffle(arr, rng)`, never `Math.random()` in sim
- Default branch is `master`
- Deployed to GitHub Pages via CI on push to `master`
- CI runs lint + build on PRs (`.github/workflows/ci.yml`)
