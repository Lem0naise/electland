import type { World, PartyDefinition, PoliticalValues } from '../types/world'
import type { GovernmentState, PoliticianState, ElectoralPact, PactCommitment } from '../types/politics'
import type { Councillor, CouncilMotion, EnactedPolicy } from '../types/council'
import { getDefaultBudget } from '../sim/council/budget'

const DEFAULT_VALUES: PoliticalValues = { change: 0, growth: 0, services: 0 }

export function makeParty(overrides?: Partial<PartyDefinition>): PartyDefinition {
  return {
    id: 'party-a',
    name: 'Progressive Alliance',
    leader: 'Alex Morgan',
    colour: '#2d5a27',
    values: { ...DEFAULT_VALUES },
    origin: 'generated',
    tier: 'major',
    footing: 'established',
    archetype: 'municipal',
    strategyTags: [],
    organization: 50,
    baseUtility: 0,
    momentum: 0,
    focusSeatIds: [],
    slogan: 'Forward together',
    aiActionPoints: 1,
    wardBoosts: {},
    ...overrides,
  }
}

export function makeCouncillor(overrides?: Partial<Councillor>): Councillor {
  return {
    id: 'cllr-1',
    name: 'Jordan Lee',
    partyId: 'party-a',
    partyColour: '#2d5a27',
    wardId: 'ward-1',
    wardName: 'Central Ward',
    personalValues: { ...DEFAULT_VALUES },
    rebellionTendency: 0.1,
    influence: 20,
    ...overrides,
  }
}

export function makeMotion(overrides?: Partial<CouncilMotion>): CouncilMotion {
  return {
    id: 'motion-1',
    proposerId: 'cllr-1',
    proposerName: 'Jordan Lee',
    proposerPartyId: 'party-a',
    headline: 'Improve local services',
    description: 'A motion to improve council services.',
    category: 'services',
    kind: 'ordinary',
    ideologyLean: { services: 10 },
    blocImpact: {},
    effects: [],
    costSignal: 0.4,
    contestedness: 'contested',
    status: 'proposed',
    votes: [],
    partyWhipDirection: {},
    ...overrides,
  }
}

export function makeGovernment(overrides?: Partial<GovernmentState>): GovernmentState {
  return {
    status: 'formed',
    kind: 'majority',
    leadPartyId: 'party-a',
    partnerPartyIds: [],
    formedWeek: 1,
    electionNumber: 0,
    ...overrides,
  }
}

export function makePolitician(overrides?: Partial<PoliticianState>): PoliticianState {
  return {
    id: 'pol-player',
    name: 'Alex Morgan',
    wardId: 'ward-1',
    partyId: 'party-a',
    isIncumbent: true,
    personalApproval: 0,
    personalValues: { ...DEFAULT_VALUES },
    personalPolicyNextWeek: 1,
    reputation: 20,
    relationships: [],
    traits: [],
    careerHistory: [{ week: 1, description: 'Elected', tier: 'backbencher', rank: 'backbencher' }],
    personalFunds: 3,
    influence: 5,
    careerRank: 'backbencher',
    careerTier: 'backbencher',
    partyLoyalty: 80,
    motionsProposed: 0,
    motionsPassed: 0,
    termsServed: 1,
    rebellions: 0,
    ...overrides,
  }
}

export function makeEnactedPolicy(overrides?: Partial<EnactedPolicy>): EnactedPolicy {
  return {
    id: 'policy-1',
    originatingMotionId: 'motion-1',
    headline: 'Improve local services',
    category: 'services',
    sponsorPartyId: 'party-a',
    governmentLeadPartyIdAtPass: 'party-a',
    enactedWeek: 1,
    effects: [],
    ...overrides,
  }
}

export function makeCommitment(overrides?: Partial<PactCommitment>): PactCommitment {
  return {
    id: 'commitment-1',
    standingDownPartyId: 'party-a',
    wardId: 'ward-1',
    beneficiaryPartyId: 'party-b',
    endorsementShare: 12,
    status: 'active',
    ...overrides,
  }
}

export function makePact(overrides?: Partial<ElectoralPact>): ElectoralPact {
  return {
    id: 'pact-1',
    partyIds: ['party-a', 'party-b'],
    electionNumber: 1,
    createdWeek: 1,
    status: 'active',
    commitments: [makeCommitment()],
    ...overrides,
  }
}

export function makeWorld(overrides?: Partial<World>): World {
  const party = makeParty()
  const wardId = 'ward-1'

  return {
    gameMode: 'single-politician',
    seed: 42,
    week: 1,
    townName: 'Testville',
    councilName: 'Testville Council',
    width: 920,
    height: 640,
    totalPopulation: 10000,
    landmass: {
      points: [[0, 0], [920, 0], [920, 640], [0, 640]],
      path: 'M0,0 L920,0 L920,640 L0,640 Z',
    },
    settlementCenters: [],
    currents: [],
    blocs: [{
      id: 'bloc-1',
      label: 'Residents',
      summary: 'Local residents',
      weight: 1,
      center: { ...DEFAULT_VALUES },
      preferredTags: [],
      avoidedTags: [],
      homeRole: 'residential',
      concentration: 0.5,
    }],
    parties: [party],
    constituencies: [{
      id: wardId,
      name: 'Central Ward',
      seed: { x: 460, y: 320 },
      population: 5000,
      turnout: 0.5,
      urbanity: 0.5,
      tags: [],
      blocMix: { 'bloc-1': 1 },
      values: { ...DEFAULT_VALUES },
      cellPath: '',
      results: [{
        partyId: party.id,
        partyName: party.name,
        colour: party.colour,
        voteShare: 45,
        votes: 2250,
      }],
      leadingPartyId: party.id,
      leadingPartyName: party.name,
      margin: 10,
      candidates: [{
        partyId: party.id,
        partyName: party.name,
        partyColour: party.colour,
        name: party.leader,
        initials: 'AM',
      }],
      history: [],
      tacticalPressure: { [party.id]: 1 },
    }],
    nationalResults: [],
    tiles: [{
      id: 'tile-1',
      x: 460,
      y: 320,
      population: 5000,
      density: 1,
      urbanity: 0.5,
      values: { ...DEFAULT_VALUES },
      salience: { change: 1, growth: 1, services: 1 },
      turnout: 0.5,
      blocMix: { 'bloc-1': 1 },
      tags: [],
      constituencyId: wardId,
    }],
    playerPartyId: party.id,
    stats: {
      councilMajority: 1,
      averageTurnout: 0.5,
      projectedMayorParty: party.name,
      projectedMayorLeader: party.leader,
      projectedMayorWards: 1,
      closestWardName: 'Central Ward',
      closestWardMargin: 10,
      safestWardName: 'Central Ward',
      safestWardMargin: 10,
      totalWards: 1,
      battlegroundWardIds: [],
    },
    electionCycleWeeks: 24,
    weeksUntilElection: 12,
    playerActionPoints: 1,
    maxActionPoints: 1,
    activeCampaigns: [],
    actionsThisWeek: [],
    newsFeed: [],
    voteHistory: [],
    electionSeatHistory: [],
    governanceDecisions: [],
    electionNightActive: false,
    electionNightResults: [],
    electionNightRevealIndex: 0,
    electionNightPreviousSeats: {},
    electionsHeld: 0,
    policyShiftUsedThisCycle: false,
    electoralPacts: [],
    pactTrust: {},
    alliancePacts: [],
    allianceReputation: {},
    simToasts: [],
    budget: getDefaultBudget(),
    councilHistory: [],
    partyAffinityMatrix: {},
    ...overrides,
  }
}
