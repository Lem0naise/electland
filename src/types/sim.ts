export interface BudgetCategory {
  id: string
  label: string
  funding: number
  blocs: string[]
}

export interface Budget {
  categories: BudgetCategory[]
  totalBudget: number
}

export interface CouncilDecisionRecord {
  week: number
  headline: string
  choice: string
}

export const VALUE_KEYS = [
  'change',
  'growth',
  'services',
] as const

export type PoliticalValueKey = (typeof VALUE_KEYS)[number]

export interface PoliticalValues {
  change: number
  growth: number
  services: number
}

export interface FictionalBloc {
  id: string
  label: string
  summary: string
  weight: number
  center: PoliticalValues
  salience?: Partial<PoliticalValues>
  turnout?: number
  preferredTags: string[]
  avoidedTags: string[]
  homeRole: string
  concentration: number
}

export interface Landmass {
  points: Array<[number, number]>
  path: string
}

export interface GeographicCurrent {
  id: string
  label: string
  description: string
  effect: Partial<PoliticalValues>
  tags: string[]
  intensity: number
  popularityEffect?: {
    target: 'major' | 'minor' | 'all'
    amount: number
  }
}

export interface SettlementCenter {
  id: string
  x: number
  y: number
  strength: number
  urbanity: number
  radius: number
  role: string
  label: string
}

export interface PopulationTile {
  id: string
  x: number
  y: number
  population: number
  density: number
  urbanity: number
  values: PoliticalValues
  salience: PoliticalValues
  turnout: number
  blocMix: Record<string, number>
  tags: string[]
  constituencyId?: string
  // Campaign boosts applied to this tile (partyId -> boost amount 0-1)
  campaignBoosts?: Record<string, number>
}

export interface WardCandidate {
  partyId: string
  partyName: string
  partyColour: string
  name: string
  initials: string
}

export interface PartyDefinition {
  id: string
  name: string
  leader: string
  colour: string
  values: PoliticalValues
  origin: 'generated' | 'custom'
  tier: 'major' | 'minor' | 'custom'
  strategyTags: string[]
  seedBlocId?: string
  organization: number
  baseUtility: number
  momentum: number
  focusSeatIds: string[]
  slogan: string
  // AI campaign state
  aiActionPoints: number
  // Per-ward canvass boosts the party has applied this cycle
  wardBoosts: Record<string, number>
  // Smear targets: wardId -> intensity of smear against player
  smearTargets?: Record<string, number>
}

export interface PartyPerformance {
  partyId: string
  partyName: string
  leader: string
  colour: string
  voteShare: number
  votes: number
  seatsWon: number
}

export interface ConstituencyResult {
  partyId: string
  partyName: string
  colour: string
  voteShare: number
  votes: number
}

export interface TilePartyPreference {
  partyId: string
  partyName: string
  leader: string
  colour: string
  support: number
  score: number
}

export interface TilePreferenceEstimate {
  turnout: number
  rankings: TilePartyPreference[]
}

export interface Constituency {
  id: string
  name: string
  seed: { x: number; y: number }
  population: number
  turnout: number
  urbanity: number
  tags: string[]
  blocMix: Record<string, number>
  values: PoliticalValues
  cellPath: string
  results: ConstituencyResult[]
  leadingPartyId: string
  leadingPartyName: string
  margin: number
  candidates: WardCandidate[]
  currentWinner?: WardCandidate
  // History of leading party + margin each week
  history: Array<{ week: number; leadingPartyId: string; margin: number; results: ConstituencyResult[] }>
}

export interface TownStats {
  councilMajority: number
  averageTurnout: number
  projectedMayorParty: string
  projectedMayorLeader: string
  projectedMayorWards: number
  closestWardName: string
  closestWardMargin: number
  safestWardName: string
  safestWardMargin: number
  totalWards: number
  battlegroundWardIds: string[]
}

export type CampaignActionType = 'canvass' | 'ads' | 'rally' | 'smear' | 'policy_shift' | 'respond_event' | 'fix_potholes' | 'improve_bins' | 'ward_festival' | 'propose_alliance' | 'break_alliance'

export type PermanentCampaignType = 'canvass' | 'ads' | 'fix_potholes' | 'improve_bins'

export interface CampaignAction {
  type: CampaignActionType
  label: string
  description: string
  apCost: number
  isPermanent?: boolean
  permanentApCost?: number
  wardId?: string
  targetPartyId?: string
  policyAxis?: PoliticalValueKey
  policyDirection?: 1 | -1
  eventId?: string
  eventChoiceIndex?: number
  allyWardId?: string
  allianceEntries?: Array<{ ourWardId: string; theirWardId: string; isUnilateral?: boolean }>
  pactId?: string
}

export interface ActionResult {
  action: CampaignAction
  wardName?: string
  targetPartyName?: string
  outcome: 'success' | 'backfire' | 'neutral'
  description: string
  // Delta in ward vote share for player party (positive = good)
  voteShareDelta?: number
  // If smear backfired
  backfired?: boolean
}

export interface WeeklyEvent {
  id: string
  headline: string
  description: string
  // Two choices the player can make
  choices: Array<{
    label: string
    description: string
    effect: {
      // Which ward tags are affected
      tags: string[]
      // Value drift applied
      valueDrift: Partial<PoliticalValues>
      // Extra support for player party in those wards (0-0.06)
      playerBoost: number
      // Extra support for opponents
      opponentBoost: number
    }
  }>
  // Which tags this event affects
  tags: string[]
  resolved: boolean
  chosenIndex?: number
}

// Vote history entry for national tracking
export interface VoteHistoryEntry {
  week: number
  partyShares: Record<string, number>
  partySeats: Record<string, number>
}

// Election night result for dramatic reveal
export interface ElectionNightResult {
  wardId: string
  wardName: string
  winner: WardCandidate
  results: ConstituencyResult[]
  candidates: Array<{ partyId: string; name: string; colour: string }>
  turnout: number
  swingFromLastElection?: number
  wasHeld: boolean
  // Party that held the seat before this election
  previousWinnerPartyId?: string
  previousWinnerPartyName?: string
  previousWinnerCandidateName?: string
  previousWinnerColour?: string
  // Margin the previous holder had going into the election
  previousMargin?: number
}

// Governance mode: between elections
export interface GovernanceDecision {
  id: string
  headline: string
  description: string
  choices: Array<{
    label: string
    description: string
    effect: {
      // Which blocs are affected (positively or negatively)
      blocEffects: Record<string, number>
      // Town-wide base utility change for player
      playerUtilityDelta: number
    }
  }>
  resolved: boolean
  chosenIndex?: number
}

export interface ActiveCampaign {
  id: string
  type: PermanentCampaignType
  label: string
  apCostPerTurn: number
  wardId?: string
  targetPartyId?: string
}

export interface AlliancePactEntry {
  id: string
  wardA: string
  wardAName: string
  wardB: string
  wardBName: string
  isUnilateral: boolean
  endorsementForB: number
  endorsementForA: number
}

export interface AlliancePact {
  id: string
  partyAId: string
  partyBId: string
  entries: AlliancePactEntry[]
  createdAtWeek: number
  expiresWeek: number
  broken?: boolean
}

export interface World {
  seed: number
  week: number
  townName: string
  councilName: string
  width: number
  height: number
  totalPopulation: number
  landmass: Landmass
  settlementCenters: SettlementCenter[]
  currents: GeographicCurrent[]
  blocs: FictionalBloc[]
  parties: PartyDefinition[]
  constituencies: Constituency[]
  nationalResults: PartyPerformance[]
  tiles: PopulationTile[]
  playerPartyId: string
  stats: TownStats
  currentMayorParty: string
  currentMayorLeader: string
  electionCycleWeeks: number
  weeksUntilElection: number
  playerActionPoints: number
  maxActionPoints: number
  activeCampaigns: ActiveCampaign[]
  actionsThisWeek: ActionResult[]
  weeklyEvent?: WeeklyEvent
  newsFeed: string[]
  voteHistory: VoteHistoryEntry[]
  isGoverning: boolean
  governanceDecisions: GovernanceDecision[]
  electionNightActive: boolean
  electionNightResults: ElectionNightResult[]
  electionNightRevealIndex: number
  electionNightPreviousSeats: Record<string, number>
  electionsHeld: number
  policyShiftUsedThisCycle: boolean
  alliancePacts: AlliancePact[]
  allianceReputation: Record<string, number>
  pendingNpcProposal?: AlliancePact
  needsCoalition: boolean
  coalitionPartnerId?: string
  minorityGovernment: boolean
  budget: Budget
  councilHistory: CouncilDecisionRecord[]
}

export interface CustomPartyDraft {
  name: string
  leader: string
  colour: string
  values: PoliticalValues
}

export interface WorldOptions {
  seed: number
  constituencyCount: number
  customParties: CustomPartyDraft[]
  playerPartyId?: string
}

export type MapMode = 'ward' | 'bloc' | 'voter' | 'redistrict'

export interface PartyEdit {
  id: string
  name: string
  leader: string
  colour: string
  values?: PoliticalValues
}

export interface CouncillorTenureHistory {
  name: string
  partyName: string
  colour: string
  termsServed: number
  firstElectedWeek: number
  lastElectedWeek: number
}

export interface CouncillorTenure {
  wardId: string
  wardName: string
  name: string
  partyName: string
  colour: string
  termsServed: number
  firstElectedWeek: number
  lastElectedWeek: number
  history: CouncillorTenureHistory[]
}
