# Electland

Electland is a browser-based local-politics career simulator. You play one politician in a procedurally generated fictional town: win a ward, build influence inside the council, pass or defeat legislation, manage political relationships, lead your party, form an administration, and ultimately become Mayor.

It is a game rather than a model or forecasting tool for real local government.

## The game

Each new game generates a fictional council area with:

- 3-16 wards;
- geographic population tiles and Voronoi-style ward boundaries;
- demographic/political blocs;
- generated parties and candidates;
- three-axis political values: Change, Growth and Services;
- ward-level polling, tactical voting and campaign effects.

Time advances week by week. Elections take place on a 24-week cycle.

The player controls an individual politician rather than the whole party. Losing an election does not end the game: you can remain active, change ward and contest the next election.

## Career progression

The intended career path is deliberately simple:

**Backbencher -> Committee Chair -> Party Leader**

Mayor is an office, not a normal promotion. You become Mayor only when:

1. you are Party Leader; and
2. your party is the lead party of the governing administration.

Becoming Mayor for the first time is Electland's main victory condition. The win screen can be acknowledged and the same game can continue afterwards.

## Elections and campaigning

The election simulation combines:

- ideological fit between voters and parties;
- party organisation and local strength;
- ward targeting and campaign activity;
- incumbency;
- the player's personal approval and political position;
- local political currents and events;
- tactical voting;
- electoral pacts and stand-down agreements.

Party scores are converted into probabilistic vote shares rather than assigning every voter to the mathematically closest party.

The same seed and the same player decisions should produce deterministic simulation outcomes.

## Council politics and legislation

Winning a seat unlocks the council game.

Council sessions allow the player to:

- vote on motions;
- lobby other councillors;
- build or damage relationships through voting behaviour;
- propose legislation;
- propose repeals;
- amend proposals;
- rebel against the party whip;
- use career-specific political powers.

Passed ordinary motions create active legislation with continuing political effects. Repeals deactivate active legislation. Budget votes are tracked separately from ordinary legislation.

Career rank changes what the player can do:

- **Backbencher:** vote, lobby and propose member motions;
- **Committee Chair:** stronger committee/agenda access and better legislative leverage;
- **Party Leader:** set party strategy and whips, manage party-wide electoral pacts, negotiate governments and, when leading the administration, control the government agenda and budget.

## Government

After an election the council can produce:

- a majority administration;
- a minority administration;
- a coalition;
- a period of government formation after No Overall Control.

Government is represented independently of the player. The player's party can therefore be in opposition, lead an administration, or be a junior coalition partner.

Only the leader of the **lead governing party** is Mayor.

## Electoral pacts

Parties can agree to stand down in selected wards for one another.

A pact is a set of explicit commitments such as:

> Party A stands down in Riverside for Party B.

Reciprocal and multi-ward deals are represented as multiple commitments. Pacts apply to the next election and complete when that election takes place.

Candidates can manage commitments affecting their own candidacy; Party Leaders can manage party-wide deals. Breaking a pact has political/trust consequences rather than being treated as a normal campaign action.

## Redistricting

The map supports draggable ward seed points. Moving seeds redraws Voronoi boundaries, reassigns population tiles and recalculates ward aggregates and polling.

This is a sandbox/game mechanic, not a model of a real legal boundary-review process.

## Tech stack

- React 19
- TypeScript 5.9
- Vite 8
- d3-delaunay
- Chart.js / react-chartjs-2
- Vitest for unit/integration tests
- React Testing Library for component tests

The application is static and has no backend. Saves are stored in browser `localStorage` and can also be exported/imported as JSON.

## Local development

Install dependencies from the lockfile:

```bash
npm ci --legacy-peer-deps
```

Start the development server:

```bash
npm run dev
```

Then open the local URL printed by Vite.

## Commands

```bash
npm run dev            # Vite development server
npm run test           # Run Vitest once
npm run test:watch     # Run Vitest in watch mode
npm run test:coverage  # Coverage report
npm run lint           # ESLint
npm run build          # TypeScript build check + production Vite build
npm run preview        # Preview the production build locally
```

Before merging gameplay changes, run:

```bash
npm run lint
npm run test
npm run build
```

## Project structure

The simulation is split by domain. `src/lib/sim.ts` may remain temporarily as a compatibility/re-export layer while older imports are migrated.

```text
src/
  components/           React UI
  data/                 Policy templates and game data
  game/                 Top-level reducer/selectors
  sim/
    core/                Deterministic RNG and maths
    world/               World generation and weekly progression
    elections/           Vote calculation and candidates
    campaigning/         Individual politician actions
    politics/            Career, government, relationships, pacts
    council/             Agenda, motions, voting, legislation, budget
    redistricting/       Boundary operations
  types/                 Domain types
  lib/
    persistence.ts       Save/load/export/import + migrations
```

See [`guidance.md`](./guidance.md) for simulation invariants, architecture details and contributor rules.

## Simulation principles

A few rules are important throughout the codebase:

- simulation RNG must be seeded and deterministic;
- domain functions should not mutate their input `World`;
- government state must describe the real administration, not just whether the player is governing;
- Mayor is derived from party leadership + government leadership;
- vote history and active legislation are separate concepts;
- pacts are election-scoped commitments;
- invalid actions should be rejected in the domain layer, not only hidden by the UI;
- resolving the same event twice must not duplicate side effects.

## Saving and compatibility

Save data is versioned. When a data-model change is introduced, add a migration and tests for older supported versions rather than silently assuming current fields exist.

Imported saves should be validated before use. Migrations should be pure: parsing/loading an old save should not mutate the input object.

## Status

Electland is an experimental game in active development. Balance, political abstractions and generated content are expected to change as the council/career systems develop.

## Domain

The project includes a `CNAME` for:

`electland.indigo.spot`
