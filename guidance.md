# Electland contributor and AI-agent guidance

This document describes the intended repository architecture and the rules that should remain true as Electland evolves. It replaces older guidance that described the obsolete party-level prototype and outdated file sizes/AP rules.

During the refactor, `src/lib/sim.ts` may temporarily re-export functions from the new modules. Prefer the domain modules for new code.

## 1. Product model

Electland is a deterministic, browser-based local-politics career simulator.

The player controls **one politician**. The important long-running loops are:

1. campaign for a ward;
2. win/hold a council seat;
3. use council sessions, legislation and relationships to gain influence;
4. progress from Backbencher to Committee Chair to Party Leader;
5. as Party Leader, lead a governing administration;
6. become Mayor, trigger the first-win screen, and optionally continue playing.

Do not reintroduce a separate party-leader game mode. Party leadership is a career state inside the single-politician game.

## 2. Non-negotiable simulation invariants

### Determinism

- All simulation randomness must come from a seeded RNG (`createRng` or an equivalent injected RNG).
- Never use `Math.random()` in simulation/domain modules.
- IDs created by the simulation should be deterministic from stable game state/sequence values, not `Date.now()`.
- Same seed + same state + same action must produce the same simulation result.

### Immutability

- Domain functions must not mutate their input `World`, arrays or nested objects.
- Do not call `push`, assign fields, or mark nested records directly on the input world.
- Return new state from commands/reducers.
- UI components must not create invalid world transitions through ad-hoc object spreading when a domain command exists.

### Idempotency

Resolution functions must be safe against duplicate calls.

Examples:
- resolving an already-resolved council session returns the unchanged world;
- acknowledging a victory twice does not create two career events;
- completing an already-completed pact does not apply effects again.

### Domain guards

The domain layer enforces permissions/invariants even if the UI also hides unavailable actions.

Examples:
- unseated politicians cannot queue council motions;
- only Party Leaders can manage party-wide pacts;
- a local candidate can only manage their own stand-down commitment unless Party Leader;
- players cannot break NPC-NPC pacts;
- only active enactments can be repealed;
- only the lead governing Party Leader controls the official government budget.

## 3. Commands

Install dependencies:

```bash
npm ci --legacy-peer-deps
```

Development:

```bash
npm run dev
```

Verification before a commit/PR:

```bash
npm run lint
npm run test
npm run build
```

Useful test commands:

```bash
npm run test:watch
npm run test:coverage
```

CI should run clean install, lint, tests and build.

## 4. Target source layout

```text
src/
  components/
  data/
    policyTemplates.ts
    traits.ts
  game/
    reducer.ts
    selectors.ts
  sim/
    core/
      math.ts
      random.ts
    world/
      generate.ts
      weekly.ts
    elections/
      calculate.ts
      candidates.ts
    campaigning/
      politicianActions.ts
    politics/
      career.ts
      government.ts
      relationships.ts
      pacts.ts
    council/
      agenda.ts
      motions.ts
      voting.ts
      legislation.ts
      budget.ts
    redistricting/
      boundaries.ts
  types/
    world.ts
    politics.ts
    council.ts
    elections.ts
  lib/
    persistence.ts
    sim.ts          # transitional re-export barrel only
```

### Dependency direction

Prefer this direction:

```text
data/types/core
      ↓
domain modules
      ↓
game reducer/selectors
      ↓
React components/App
```

Do not import React/UI code into simulation modules.

Avoid circular dependencies between council/government/career modules. Put small shared selectors/types in neutral modules rather than importing entire domains into each other.

## 5. Core state model

### Political values

The game uses three political axes:

```ts
interface PoliticalValues {
  change: number
  growth: number
  services: number
}
```

Values are normally bounded to `-100..100`.

Keep labels consistent in UI:
- Change: conservative/cautious <-> reform/progressive;
- Growth: restrict <-> develop/business/growth;
- Services: cut/low-spend <-> invest/public services.

### Career

Live career ranks:

```ts
type CareerRank = 'backbencher' | 'committee-chair' | 'party-leader'
```

There is no Deputy Leader rank.

Mayor is **not** a career rank. Use the office selector:

```ts
isPlayerMayor(world)
```

The player is Mayor iff:
- player career rank is `party-leader`; and
- current formed government's `leadPartyId === world.playerPartyId`.

The victory record is historical and persists even if the player later loses office.

### Government

Use one objective state:

```ts
interface GovernmentState {
  status: 'forming' | 'formed'
  kind: 'caretaker' | 'majority' | 'minority' | 'coalition'
  leadPartyId: string
  partnerPartyIds: string[]
  formedWeek: number
  electionNumber: number
}
```

Do not add player-relative booleans such as `isGoverning` as authoritative state. Use selectors:

```ts
isPartyInGovernment(world, partyId)
isPlayerPartyInGovernment(world)
isPlayerPartyGovernmentLead(world)
governmentLeadParty(world)
```

A junior coalition partner is in government but does not hold the Mayor office.

### Victory

Suggested state:

```ts
interface VictoryState {
  mayorFirstAchievedWeek?: number
  mayorFirstAchievedElection?: number
  victoryScreenSeen: boolean
}
```

`reconcilePlayerOfficeAndVictory()` should run after government formation and leadership changes.

## 6. World generation and weekly simulation

### World generation

`generateWorld` is responsible for:
- deterministic town/ward geography;
- settlement/population tiles;
- blocs;
- parties/candidates;
- initial polling;
- initial caretaker administration;
- first-election timing.

World generation should not depend on browser state.

### Weekly order

Keep weekly advancement explicit and tested. A sensible order is:

1. increment/evolve world currents;
2. decay campaign effects;
3. replenish/reset weekly player/AI action state;
4. execute configured auto action;
5. run AI campaign actions;
6. run pact proposal/review commands without mutation;
7. recalculate polling/results;
8. if election due, freeze election result and begin government-formation flow;
9. update player career/seat/councillor state;
10. schedule council sessions/events;
11. append bounded news/history views.

If this order changes, add tests for the behavior affected. Do not rely on incidental mutation order.

## 7. Elections

### Vote calculation

Voting remains probabilistic/softmax-based. Core score sources include:
- local/ward fit;
- organisation;
- ideological fit;
- events/currents;
- momentum/base utility;
- ward campaign effects;
- tactical pressure;
- incumbency;
- player personal approval/position in the player's ward;
- active policy reputation;
- active pact stand-down/endorsement effects.

Standing down should be represented as an explicit pact result, not as candidate deletion.

### Election result invariants

After an election:
- every ward has exactly one winner;
- elected seat counts sum to number of wards;
- player seat status is based on the winner in the player's ward;
- if player loses, the winning NPC councillor exists in the council list;
- if player wins, that ward is represented by the player rather than a duplicate NPC councillor;
- government is `forming` until coalition/majority/minority resolution is complete.

Use `changedHands`, not the misleading old `wasHeld`, for party-change flags.

### Councillor identity

Prefer stable person IDs. Do not make a person's identity equal to a ward ID if/when relationship depth depends on individual continuity.

If legacy ward-based IDs remain temporarily, successor handling must be explicit and tested.

## 8. Career progression

### Backbencher -> Committee Chair

Recommended requirements:
- incumbent;
- >= 1 term served;
- >= 2 player-sponsored motions passed;
- influence >= 20.

### Committee Chair -> Party Leader

Recommended requirements:
- incumbent;
- >= 2 terms served;
- influence >= 60;
- reputation >= 60;
- party loyalty >= 50;
- enough same-party political support, scaled to caucus size.

Use a leadership action (`Launch leadership challenge`) rather than `Accept Promotion`.

On success:
- rank -> `party-leader`;
- update `PartyDefinition.leader` to player name/identity;
- unlock coalition negotiations, party-wide pact management and whip controls.

### Mayor

Do not expose a promotion requirement for Mayor.

Mayor derives from government + Party Leader state and should be reconciled automatically. This condition applies to majority, minority and coalition administrations where the player's party is the **lead** party.

## 9. Council and legislation

### Separate vote history from active policy

Do not use `CouncilMotion.status === 'passed'` as a proxy for "law currently in force".

Use:

```ts
CouncilMotion[]     // vote/archive events
EnactedPolicy[]     // active/repealed policy records
BudgetEvent[]       // budget outcomes
```

A passed ordinary motion creates one `EnactedPolicy`.
A passed repeal deactivates an existing enactment.
A budget does not appear as active ordinary legislation.

### Motion identity

Every motion should store:
- proposer name/ID if applicable;
- `proposerPartyId`;
- structured policy effects;
- ideology and cost;
- whip directions;
- final votes;
- target enactment for repeal.

Do not infer proposer party by scanning strings at render time.

### Structured policy templates

Policy meaning must come from structured data, not generated prose.

A template should define:
- category;
- intervention/content options;
- ideology delta;
- cost signal;
- bloc effects.

Generate the headline/description from those mechanics.

Avoid logic like:

```ts
if (intervention.includes('cut')) ...
```

for authoritative policy meaning.

### Council-session invariants

- Unseated player cannot queue/vote.
- Already-resolved session is a no-op.
- Session cannot resolve before required player votes.
- Each councillor has max one vote per motion.
- Ayes must exceed Nays for passage unless a future casting-vote rule is deliberately introduced.
- Career counters and relationship effects apply once.
- Budget effects run only for actual budget events.
- Legislation effects run only for enact/repeal events.

### Agenda

The existing `motions[]` shape should be used deliberately.

Target ordinary session:
- government/NPC business;
- member/committee business (player queued motion when applicable).

Use `activeMotionIndex` and explicit session phase rather than always displaying the last motion.

### Career powers

Backbencher:
- vote;
- lobby;
- propose member motion;
- rebel.

Committee Chair:
- reduced proposal/amendment cost;
- improved vote intelligence;
- extra/guaranteed committee agenda access.

Party Leader:
- choose own party whip;
- negotiate governments;
- manage party-wide pacts;
- if government lead: set government agenda and official budget.

### Budget

The official budget belongs to the lead administration.

Only a player who is Party Leader **and** government lead can table the official government draft.

Opposition/junior partners can propose amendments but do not become the official budget author automatically.

Budget history distinguishes:
- passed;
- failed;
- officer-imposed/rolled-over fallback.

Never record an imposed fallback as a passed council vote.

### Policy electoral effects

Keep legislation reputation separate from campaign boosts.

`scorePartyForTile()` should include a policy reputation term derived from active enactments and party responsibility.

Do not permanently write every passed law into `tile.campaignBoosts[playerPartyId]`.

Repeal stops the target enactment's ongoing effect because it is no longer active.

## 10. Electoral pacts

### Data model

Use explicit commitments:

```ts
interface PactCommitment {
  id: string
  standingDownPartyId: string
  wardId: string
  beneficiaryPartyId: string
  endorsementShare: number
  status: 'active' | 'withdrawn' | 'completed'
}

interface ElectoralPact {
  id: string
  partyIds: [string, string]
  electionNumber: number
  createdWeek: number
  status: 'active' | 'completed' | 'broken'
  commitments: PactCommitment[]
}
```

Do not encode semantics through `partyA/partyB`, `wardA/wardB`, or a fake `wardId` containing a pact ID.

### Lifecycle

- A pact applies to a specific upcoming election.
- It becomes completed immediately after that election.
- Completed/broken pact commitments have no scoring effect.
- Pending proposal has a response deadline and expires at election.

### Permissions

- Candidate: may manage own ward stand-down commitment.
- Party Leader: may manage all own-party commitments.
- Never expose or allow management of NPC-NPC pacts as player pacts.

### Evaluation

One pure evaluator must power both UI preview and final submission:

```ts
evaluatePactProposal(world, proposal)
```

The UI may show acceptance percentage/confidence but should not reveal a deterministic pre-rolled yes/no result.

### Breaking/withdrawing

Do not charge normal weekly campaign AP for ending a pact. Use political consequences:
- trust loss;
- larger penalty near election;
- possible party-loyalty consequence for a local candidate defying party terms.

Allow withdrawal from one commitment as well as ending a complete pact.

### Trust

Use an intuitive `pactTrust` scale where higher is better. Avoid a field named "reputation" whose increasing value is actually a penalty.

## 11. Relationships

Relationships should refer to stable political people where possible.

Council voting may change relationship strength based on agreement/disagreement and sponsorship.

When adding relationship mechanics:
- cap strength to `-100..100`;
- derive Ally/Rival labels from thresholds;
- keep history bounded for UI;
- do not let a successor silently inherit a predecessor's exact identity.

## 12. Traits

Trait effects should have one source of truth.

Either:
- use typed generic modifier data and consume it consistently; or
- use explicit rule helpers by trait ID.

Do not store generic modifiers that are ignored while separately hard-coding the same effects elsewhere.

If `personalFunds` remains, it must have a spending/decision loop. Otherwise remove the resource and Fundraiser effect until campaign finance exists.

## 13. Redistricting

Boundary changes should remain deterministic and explicit:
- drag/change ward seeds;
- reassign tiles to nearest seed;
- recalculate ward aggregates;
- regenerate cell paths;
- recalculate results.

Keep a snapshot/restore path for undo/reset.

Map rendering should not mutate simulation state directly.

## 14. Persistence

### Versioning

Every incompatible state-model change bumps the save version and supplies a tested migration.

Expected migration concerns for the career/government/legislation/pact refactor:
- Deputy Leader -> Committee Chair;
- old Mayor -> Party Leader + historical Mayor victory;
- Party Leader synchronizes party leader identity;
- old government flags -> objective `GovernmentState`;
- old pact A/B entries -> explicit commitments;
- old passed ordinary motions -> active enactments where possible;
- old passed repeal/budget motions do not become active laws.

### Migration rules

- Migrations must be pure.
- Do not mutate the parsed input save.
- Validate critical party/ward IDs after migration.
- Preserve player achievements whenever possible.
- Do not silently fabricate precision that old saves never stored (for example an unknown NPC coalition partner).

## 15. Testing rules

Use Vitest for domain tests and React Testing Library for important UI boundaries.

### Required high-value test areas

Career/government:
- three-rank progression;
- leadership updates party leader;
- Mayor requires Party Leader + lead government;
- junior coalition partner is not Mayor;
- first-win screen fires once.

Council:
- resolution idempotency;
- vote requirement;
- true governing-party whips;
- correct budget proposer;
- tie behavior;
- career/relationship effects once.

Legislation:
- pass creates enactment;
- fail does not;
- repeal deactivates target;
- repeal/budget not active law;
- policy attribution correct;
- ordinary motion does not reapply budget;
- duplicate budget bloc impacts aggregate.

Pacts:
- exact ward stand-down effect;
- no unrelated ward effect;
- no NPC-NPC management by player;
- own-ward vs Party Leader permissions;
- one evaluator for preview/submit;
- lifecycle completes at election;
- immutable AI operations;
- deterministic acceptance.

Elections:
- winning/losing player's ward creates correct council composition;
- seat counts equal wards;
- changed-hands semantics;
- deterministic results for same state.

Persistence:
- old versions migrate;
- migration does not mutate input;
- export/import round trip.

### Invariant loops

For a range of seeds, test:
- no NaN/Infinity;
- vote shares approximately sum to 100% per ward;
- budget sums exactly to its total;
- bounded stats stay bounded;
- unique active pact commitment per party/ward;
- government party IDs exist;
- active policy IDs unique.

## 16. React/UI conventions

- Domain decisions belong in simulation/reducer code, not component callbacks.
- UI local state is appropriate for tabs, expanded sections, form drafts and modal visibility.
- Use accessible modal semantics (`role="dialog"`, `aria-modal="true"`) and keyboard closing where appropriate.
- Preserve focus-visible and reduced-motion behavior.
- Avoid hard-coding success colors when theme variables exist.
- Keep mobile behavior at existing responsive breakpoints unless a component redesign intentionally changes them.

## 17. Known legacy code to remove after migration

Do not expand these old paths:
- `CampaignActionsPanel.tsx` (unreferenced old party-level campaign UI);
- live `GameMode` switching;
- `ActiveCampaign`/old permanent campaign state if no callers remain;
- generic `GovernanceDecision` system after it is folded into council legislation;
- old `GovernmentDashboard` direct-budget path unless rebuilt intentionally;
- old pact A/B helper functions after the commitment model lands.

Always reference-search before deleting a type/function/component.

## 18. Documentation maintenance

When a major mechanic changes, update in the same PR:
- README feature description if player-facing behavior changed;
- this guidance if architecture/invariants changed;
- AGENTS.md commands/file map if tooling or source layout changed;
- save version/migration tests if state changed.

Do not include approximate line counts in guidance; they become stale quickly.

Do not claim CI/deployment workflows exist unless the files are present in the repository.

## 19. Change checklist

Before completing a gameplay PR, check:

- Is the transition deterministic?
- Does it mutate input state?
- Is the rule enforced in the domain as well as the UI?
- Can the same event be resolved twice?
- Does it need a save migration?
- Does it affect government/career/Mayor reconciliation?
- Does it affect active legislation separately from vote history?
- Does it affect pact lifecycle/permissions?
- Are there tests for success, failure and edge cases?
- Do README/guidance/AGENTS need updating?

The goal is to make Electland's political rules explicit enough that a new feature can be added without depending on hidden state conventions inside a single large simulation function.
