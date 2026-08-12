import type { CouncilDecisionRecord, PoliticianModeState } from './council'
import type { ElectionNightResult, ElectionSeatHistoryEntry, VoteHistoryEntry } from './elections'
import type {
  AlliancePact,
  ElectoralPact,
  GovernmentState,
  VictoryState,
} from './politics'

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
    target: 'established' | 'challenger' | 'fringe' | 'all' | 'major' | 'minor'
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
  campaignBoosts?: Record<string, number>
}

export interface WardCandidate {
  partyId: string
  partyName: string
  partyColour: string
  name: string
  initials: string
}

export type PartyArchetype =
  | 'municipal'
  | 'workers'
  | 'business'
  | 'green'
  | 'independence'
  | 'coastal'
  | 'ratepayers'
  | 'single_issue'
  | 'faith_community'

export type PartyFooting = 'established' | 'challenger' | 'fringe'

export interface PartyDefinition {
  id: string
  name: string
  leader: string
  colour: string
  values: PoliticalValues
  origin: 'generated' | 'custom'
  /** @deprecated Prefer footing; kept for save compatibility */
  tier: 'major' | 'minor' | 'custom'
  footing: PartyFooting
  archetype: PartyArchetype
  issueFocus?: string
  strategyTags: string[]
  seedBlocId?: string
  organization: number
  baseUtility: number
  momentum: number
  focusSeatIds: string[]
  slogan: string
  aiActionPoints: number
  wardBoosts: Record<string, number>
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
  tacticalPressure?: Record<string, number>
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

export type CampaignActionType =
  | 'canvass'
  | 'ads'
  | 'rally'
  | 'smear'
  | 'policy_shift'
  | 'respond_event'
  | 'fix_potholes'
  | 'improve_bins'
  | 'ward_festival'
  | 'propose_alliance'
  | 'break_alliance'

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
  voteShareDelta?: number
  backfired?: boolean
}

export interface WeeklyEvent {
  id: string
  headline: string
  description: string
  choices: Array<{
    label: string
    description: string
    effect: {
      tags: string[]
      valueDrift: Partial<PoliticalValues>
      playerBoost: number
      opponentBoost: number
    }
  }>
  tags: string[]
  resolved: boolean
  chosenIndex?: number
}

export interface GovernanceDecision {
  id: string
  headline: string
  description: string
  choices: Array<{
    label: string
    description: string
    effect: {
      blocEffects: Record<string, number>
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

export type GameMode = 'party-leader' | 'single-politician'

export interface World {
  gameMode: GameMode
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
  electionCycleWeeks: number
  weeksUntilElection: number
  playerActionPoints: number
  maxActionPoints: number
  activeCampaigns: ActiveCampaign[]
  actionsThisWeek: ActionResult[]
  weeklyEvent?: WeeklyEvent
  newsFeed: string[]
  voteHistory: VoteHistoryEntry[]
  electionSeatHistory: ElectionSeatHistoryEntry[]
  governanceDecisions: GovernanceDecision[]
  electionNightActive: boolean
  electionNightResults: ElectionNightResult[]
  electionNightRevealIndex: number
  electionNightPreviousSeats: Record<string, number>
  electionsHeld: number
  policyShiftUsedThisCycle: boolean
  electoralPacts: ElectoralPact[]
  pactTrust: Record<string, number>
  /** @deprecated Use electoralPacts */
  alliancePacts: AlliancePact[]
  /** @deprecated Use pactTrust */
  allianceReputation: Record<string, number>
  pendingNpcProposal?: AlliancePact
  budget: Budget
  councilHistory: CouncilDecisionRecord[]
  politicianMode?: PoliticianModeState
  pendingActionToast?: string
  simToasts: SimToast[]
  government?: GovernmentState
  victory?: VictoryState
}

export interface SimToast {
  message: string
  outcome: 'success' | 'neutral' | 'backfire'
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
  partyEdits?: PartyEdit[]
  playerPartyId?: string
  gameMode?: GameMode
  playerWardId?: string
  playerName?: string
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
