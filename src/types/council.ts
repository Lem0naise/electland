import type { Budget, PoliticalValues } from './world'
import type { PoliticianActionType, PoliticianState } from './politics'

export interface CouncilDecisionRecord {
  week: number
  headline: string
  choice: string
}

export type MotionCategory =
  | 'planning'
  | 'budget'
  | 'services'
  | 'environment'
  | 'governance'
  | 'transport'
  | 'housing'
  | 'safety'
  | 'economy'

export type MotionKind = 'ordinary' | 'repeal' | 'budget'
export type MotionContestedness = 'broad' | 'contested' | 'divisive'
export type MotionStatus = 'proposed' | 'debating' | 'voting' | 'passed' | 'failed' | 'repealed'

export interface PolicyEffect {
  blocId: string
  utilityDelta: number
  salience: number
}

export interface EnactedPolicy {
  id: string
  originatingMotionId: string
  headline: string
  category: MotionCategory
  sponsorPartyId: string
  governmentLeadPartyIdAtPass: string
  enactedWeek: number
  repealedWeek?: number
  repealedByMotionId?: string
  effects: PolicyEffect[]
}

export type BudgetOutcome = 'passed' | 'failed' | 'officer-imposed'

export interface BudgetEvent {
  week: number
  outcome: BudgetOutcome
  proposerPartyId: string
  budget?: Budget
  motionId: string
}

export interface CouncilMotionVote {
  councillorId: string
  councillorName: string
  partyId: string
  vote: 'aye' | 'nay' | 'abstain'
}

export interface CouncilMotion {
  id: string
  proposerId: string
  proposerName: string
  proposerPartyId: string
  headline: string
  description: string
  category: MotionCategory
  kind: MotionKind
  ideologyLean: Partial<PoliticalValues>
  blocImpact: Record<string, number>
  effects: PolicyEffect[]
  costSignal: number
  contestedness: MotionContestedness
  status: MotionStatus
  votes: CouncilMotionVote[]
  partyWhipDirection: Record<string, 'aye' | 'nay' | 'free'>
  playerVote?: 'aye' | 'nay' | 'abstain'
  whipIssuerId?: string
  whipIssuerName?: string
  targetMotionId?: string
  repealedById?: string
  budgetProposal?: Budget
}

export interface CouncilSession {
  week: number
  motions: CouncilMotion[]
  activeMotionIndex: number
  phase: 'agenda' | 'lobbying' | 'voting' | 'resolved'
  resolved: boolean
  budgetSession?: boolean
}

export interface Councillor {
  id: string
  name: string
  partyId: string
  partyColour: string
  wardId: string
  wardName: string
  personalValues: PoliticalValues
  rebellionTendency: number
  influence: number
}

export interface CustomMotionInput {
  headline: string
  description: string
  category: MotionCategory
  ideologyLean: PoliticalValues
  kind?: MotionKind
  targetMotionId?: string
  costSignal?: number
  budgetProposal?: Budget
}

export interface PoliticianModeState {
  politician: PoliticianState
  councillors: Councillor[]
  currentSession?: CouncilSession
  sessionHistory: Array<{ week: number; motionsPassed: number; motionsFailed: number }>
  nextSessionWeek: number
  councilSessionInterval: number
  nextBudgetWeek: number
  proposedBudget?: Budget
  /** @deprecated Use budgetEvents */
  budgetHistory: Array<{ week: number; passed: boolean }>
  budgetEvents: BudgetEvent[]
  autoCampaigns: PoliticianActionType[]
  autoColleagueWardId?: string
  queuedMotion?: CustomMotionInput
  legislationHistory: CouncilMotion[]
  activePolicies: EnactedPolicy[]
}
