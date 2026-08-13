import type { PoliticalValueKey, PoliticalValues } from './world'

export type CareerRank = 'backbencher' | 'committee-chair' | 'party-leader'

/** @deprecated Use CareerRank */
export type CareerTier = 'backbencher' | 'committee-chair' | 'deputy-leader' | 'party-leader' | 'mayor'

export type GovernmentKind = 'caretaker' | 'majority' | 'minority' | 'coalition'

export interface GovernmentState {
  status: 'forming' | 'formed'
  kind: GovernmentKind
  leadPartyId: string
  partnerPartyIds: string[]
  formedWeek: number
  electionNumber: number
}

export interface VictoryState {
  mayorFirstAchievedWeek?: number
  mayorFirstAchievedElection?: number
  victoryScreenSeen: boolean
}

export type PactStatus = 'active' | 'completed' | 'broken'

export interface PactCommitment {
  id: string
  standingDownPartyId: string
  wardId: string
  beneficiaryPartyId: string
  endorsementShare: number
  status: 'active' | 'withdrawn' | 'completed'
}

export interface ElectoralPact {
  id: string
  partyIds: [string, string]
  electionNumber: number
  createdWeek: number
  status: PactStatus
  commitments: PactCommitment[]
  brokenWeek?: number
  completedWeek?: number
}

/** @deprecated Use ElectoralPact */
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

/** @deprecated Use ElectoralPact */
export interface AlliancePact {
  id: string
  partyAId: string
  partyBId: string
  entries: AlliancePactEntry[]
  createdAtWeek: number
  expiresWeek: number
  broken?: boolean
}

export type PoliticianActionType =
  | 'door_knock'
  | 'hold_surgery'
  | 'leaflet_drop'
  | 'local_media'
  | 'call_party_support'
  | 'help_colleague'
  | 'attend_event'
  | 'smear_opponent'
  | 'shift_personal_policy'
  | 'shift_party_policy'
  | 'propose_motion'
  | 'second_motion'
  | 'lobby_councillor'
  | 'rebel_vote'

export interface PoliticianTrait {
  id: string
  label: string
  effect: string
  modifier?: Partial<{
    approvalGain: number
    reputationGain: number
    influenceGain: number
    rebellionCostReduction: number
  }>
}

export interface CareerEvent {
  week: number
  description: string
  /** @deprecated Use rank */
  tier: CareerTier
  rank?: CareerRank
}

export interface Relationship {
  targetId: string
  targetName: string
  partyId: string
  partyColour: string
  wardId: string
  type: 'ally' | 'rival' | 'mentor' | 'neutral'
  strength: number
  history: string[]
}

export interface PoliticianState {
  id: string
  name: string
  wardId: string
  partyId: string
  isIncumbent: boolean
  personalApproval: number
  personalValues: PoliticalValues
  personalPolicyNextWeek: number
  reputation: number
  relationships: Relationship[]
  traits: PoliticianTrait[]
  careerHistory: CareerEvent[]
  personalFunds: number
  influence: number
  careerRank: CareerRank
  /** @deprecated Use careerRank */
  careerTier: CareerTier
  partyLoyalty: number
  motionsProposed: number
  motionsPassed: number
  termsServed: number
  rebellions: number
}

export type ActionCategory = 'grassroots' | 'communications' | 'political' | 'incumbent'

export interface PoliticianActionMeta {
  type: PoliticianActionType
  label: string
  description: string
  apCost: number
  category: ActionCategory
  expectedEffect: string
  riskDescription?: string
  traitBonus?: string
  policyAxis?: PoliticalValueKey
  policyDirection?: 1 | -1
  targetWardId?: string
}
