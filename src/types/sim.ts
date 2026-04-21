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
  // History of leading party + margin each week
  history: Array<{ week: number; leadingPartyId: string; margin: number; results: ConstituencyResult[] }>
}

export interface TownStats {
  councilMajority: number
  averageTurnout: number
  projectedMayorParty: string
  projectedMayorLeader: string
  projectedMayorWards: number
  currentMayorParty: string
  currentMayorLeader: string
  closestWardName: string
  closestWardMargin: number
  safestWardName: string
  safestWardMargin: number
  totalWards: number
  electionCycleWeeks: number
  weeksUntilElection: number
  battlegroundWardIds: string[]
}

// Campaign actions the player can take
export type CampaignActionType = 'canvass' | 'ads' | 'rally' | 'smear' | 'policy_shift' | 'respond_event' | 'fix_potholes' | 'improve_bins' | 'ward_festival'

export interface CampaignAction {
  type: CampaignActionType
  label: string
  description: string
  apCost: number
  isPermanent?: boolean
  permanentApCost?: number
  // For ward-targeted actions
  wardId?: string
  // For smear: target party
  targetPartyId?: string
  // For policy shift: which axis and direction
  policyAxis?: PoliticalValueKey
  policyDirection?: 1 | -1
  // For event response
  eventId?: string
  eventChoiceIndex?: number
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
  swingFromLastElection?: number
  // Whether this ward changed hands at this election
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
  type: CampaignActionType
  label: string
  apCostPerTurn: number
  wardId?: string
  targetPartyId?: string
}

export interface World {
  seed: number
  week: number
  name: string
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
  headlines: string[]
  stats: TownStats
  currentMayorParty: string
  currentMayorLeader: string
  electionCycleWeeks: number
  weeksUntilElection: number
  // Campaign resources
  playerActionPoints: number
  maxActionPoints: number
  // Active permanent campaigns
  activeCampaigns: ActiveCampaign[]
  // Actions taken this week (cleared at start of each week)
  actionsThisWeek: ActionResult[]
  // Weekly event (one per week, optional)
  weeklyEvent?: WeeklyEvent
  // News feed: most recent first
  newsFeed: string[]
  // Vote history for sparklines/charts
  voteHistory: VoteHistoryEntry[]
  // Governance mode
  isGoverning: boolean
  governanceDecisions: GovernanceDecision[]
  // Election night state
  electionNightActive: boolean
  electionNightResults: ElectionNightResult[]
  electionNightRevealIndex: number
  // Seat counts from BEFORE this election (for before/after comparison)
  electionNightPreviousSeats: Record<string, number>
  // How many elections have been held
  electionsHeld: number
  // Whether the player has won
  playerWon: boolean
  playerLost: boolean
  // Policy shift cooldown (resets each cycle)
  policyShiftUsedThisCycle: boolean
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
