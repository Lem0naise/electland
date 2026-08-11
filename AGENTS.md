# AGENTS.md

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck + production build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm run test` — run Vitest once
- `npm run test:watch` — Vitest in watch mode
- `npm run test:coverage` — coverage report
- `npm ci --legacy-peer-deps` — install dependencies (flag required by peer dep conflicts)

## Verification

Run in this order before committing:
1. `npm run lint`
2. `npm run test`
3. `npm run build`

## Architecture

See `guidance.md` for detailed simulation logic and architecture overview.

### Source layout

```text
src/
  components/           React UI
  data/                 Policy templates and game data
  game/                 Top-level reducer/selectors
  sim/
    core/               Deterministic RNG and maths
    world/              World generation and weekly progression
    elections/          Vote calculation and candidates
    campaigning/        Individual politician actions
    politics/           Career, government, relationships, pacts
    council/            Agenda, motions, voting, legislation, budget
    redistricting/      Boundary operations
  types/                Domain types (world, politics, council, elections)
  lib/
    sim.ts              Transitional barrel (legacy callers)
    persistence.ts      Save/load/export/import + migrations
  test/                 Test setup and builders
```

### Dependency direction

```text
data/types/core
      ↓
domain modules (sim/)
      ↓
game reducer/selectors
      ↓
React components/App
```

Do not import React/UI code into simulation modules.

### Key domain modules

| Module | Role |
|--------|------|
| `src/sim/core/random.ts` | Deterministic RNG (createRng, shuffle) |
| `src/sim/core/math.ts` | clamp, lerp, softmax, roundPoliticalValues |
| `src/sim/politics/career.ts` | 3-rank career, leadership challenge, Mayor derivation |
| `src/sim/politics/government.ts` | GovernmentState lifecycle, selectors |
| `src/sim/politics/pacts.ts` | Commitment-based electoral pacts |
| `src/sim/politics/relationships.ts` | Councillor relationships |
| `src/sim/council/agenda.ts` | Session generation, resolution |
| `src/sim/council/motions.ts` | Motion generation from templates |
| `src/sim/council/voting.ts` | NPC votes, whips |
| `src/sim/council/legislation.ts` | Active enactments, repeal, policy scoring |
| `src/sim/council/budget.ts` | Budget authorship, effects, failure handling |
| `src/data/policyTemplates.ts` | Structured policy templates |
| `src/game/reducer.ts` | Typed game action reducer |
| `src/game/selectors.ts` | Derived state selectors |
| `src/lib/persistence.ts` | Save v3, migrations, validation |

### Key types

| File | Contents |
|------|----------|
| `src/types/world.ts` | World, Budget, Party, Constituency, tiles, events |
| `src/types/politics.ts` | CareerRank, GovernmentState, VictoryState, ElectoralPact, PoliticianState |
| `src/types/council.ts` | CouncilMotion, CouncilSession, EnactedPolicy, BudgetEvent, Councillor |
| `src/types/elections.ts` | Election result types |
| `src/types/sim.ts` | Barrel re-export of all type modules |

## Key systems

### Career progression
- Ranks: `backbencher -> committee-chair -> party-leader`
- No Deputy Leader rank
- Mayor is an office, not a rank: derived from Party Leader + government lead

### Government
- `GovernmentState` with `status: 'forming' | 'formed'`
- Kinds: caretaker, majority, minority, coalition
- Use selectors: `isPlayerMayor`, `isPartyInGovernment`, `isPlayerPartyGovernmentLead`

### Legislation
- Vote history (CouncilMotion[]) separate from active policy (EnactedPolicy[])
- Repeal deactivates enactments; repealed policy has no scoring effect
- Policy effects scored via `scorePolicyReputationForTile` (not baked into campaignBoosts)
- Budget effects aggregated properly (no duplicate bloc overwrite)

### Electoral pacts
- Commitment-based model (PactCommitment[])
- Election-scoped: complete at election
- Trust-based (pactTrust: Record<string, number>)
- One evaluator for preview and submission

### Persistence
- Save version: 3
- Pure migrations (no input mutation)
- Migrates career, government, pacts, legislation from v1/v2

## Conventions

- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- No comments in code unless explaining non-obvious intent
- All simulation RNG must be deterministic: use `createRng(seed)`, never `Math.random()`
- Domain functions must not mutate input World
- Resolution functions must be idempotent
- Default branch is `master`
- CI runs lint + test + build on PRs (`.github/workflows/ci.yml`)

## UI conventions

- Newspaper theme: serif fonts, var(--ink) color palette, var(--paper) backgrounds
- Modals use `.modal-backdrop` + `.modal` with `role="dialog" aria-modal="true"`
- Mobile: `@media (max-width: 720px)` for game UI, `@media (max-width: 900px)` for stats
- `prefers-reduced-motion` support
- `:focus-visible` global outline ring
- Success/positive color: `var(--safe)` (do NOT hardcode hex greens)
