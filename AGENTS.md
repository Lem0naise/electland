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
| `src/lib/sim.ts` | ~3600 | Simulation engine — world gen, weekly sim, vote calc, alliances, pacts, redistricting, tenure |
| `src/types/sim.ts` | ~400 | All TypeScript interfaces and types |
| `src/lib/persistence.ts` | ~80 | Save/load to localStorage + JSON export/import |
| `src/App.tsx` | ~600 | Top-level state, all handlers, layout shell |
| `src/App.css` | ~2900 | All styles (newspaper theme, mobile breakpoints at 720px/900px) |
| `src/components/CampaignActionsPanel.tsx` | ~800 | Campaign UI: actions, pacts, auto-campaigns, NPC proposals, pact builder |
| `src/components/MapFigure.tsx` | ~400 | SVG map: ward/bloc/voter/redistrict modes, seed dragging |
| `src/components/StatisticsModal.tsx` | ~530 | Full-screen stats: standings, trends, party detail, councillor tenure |
| `src/components/SetupScreen.tsx` | ~360 | Town gen, party picker/editor, UK names, load game |
| `src/components/ElectionNightModal.tsx` | ~380 | Election results reveal, copy results, coalition trigger |
| `src/components/CoalitionModal.tsx` | ~250 | Post-election government formation |
| `src/components/ConstituencyInspector.tsx` | ~400 | Ward detail: demographics, fit, history, campaigns |
| `src/components/GovernanceModal.tsx` | ~60 | Council decisions during governing |
| `src/components/SeatBar.tsx` | ~50 | Horizontal seat bar, opens stats modal |
| `src/components/ActionFlash.tsx` | ~30 | Toast notification |
| `src/components/VoteHistoryChart.tsx` | ~90 | SVG sparkline chart |
| `src/components/IdeologyWidget.tsx` | ~40 | Three-axis position graphic |

## Key systems to know

### Alliance pacts
- Created via `applyCampaignAction` case `'propose_alliance'`
- Scored per-tile in `allianceModifier()`: standing-down party gets -999, ally gets endorsement bonus = stored share × 0.01
- Acceptance via `evaluateAllianceAcceptance()` and `deterministicAcceptance()` (hash-based, stable within a week)
- `suggestPacts()` returns ranked ward pairs with breakdown and acceptance info
- NPC pacts: 5% per party per week in `runAICampaigns()`, reviewed every 4 weeks
- Pacts persist across elections

### Coalition government
- Post-election NOC triggers `CoalitionModal`
- `coalitionCompatibility()` scores ideology match 0-100%
- `generateGovernanceDecisions(n)` picks governance decisions
- `blocEffects` applied to coalition partner's utility

### Voting
- `scorePartyForTile()`: wardFit + focus + organization + tagBonus + issueFit + eventBonus + baseUtility + momentum + wardBoost + tileBoost + incumbencyBonus
- Softmax over scores gives vote shares. Score range roughly -0.5 to +2.5
- +0.20 score shift ≈ +5% vote share gain

### Redistricting
- Map mode `'redistrict'`: drag Voronoi seed points to gerrymander
- `recalculateWardAggregates()` + `regenerateCellPaths()` + `calculateResults()` on Done
- Snapshot save/restore for undo

### Councillor tenure
- `loadCouncillorTenure()` / `updateCouncillorTenure()` — localStorage persistence
- Displayed in StatisticsModal

## UI conventions
- Newspaper theme: serif fonts, var(--ink) color palette, var(--paper) backgrounds
- Inline action cards with `.ac-expand-toggle` pattern for config panels
- Modals use `.modal-backdrop` + `.modal` classes
- Mobile: `@media (max-width: 720px)` for game UI, `@media (max-width: 900px)` for stats modal

## Conventions
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters` — no dead code allowed
- No comments in code unless requested
- Default branch is `master`
- Deployed to GitHub Pages via CI on push to `master`
