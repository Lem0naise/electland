import type { ConstituencyResult, WardCandidate } from './world'

export interface VoteHistoryEntry {
  week: number
  partyShares: Record<string, number>
  partySeats: Record<string, number>
}

export interface ElectionSeatHistoryEntry {
  week: number
  electionNumber: number
  partySeats: Record<string, number>
  governmentLabel?: string
}

export interface ElectionNightResult {
  wardId: string
  wardName: string
  winner: WardCandidate
  results: ConstituencyResult[]
  candidates: Array<{ partyId: string; name: string; colour: string }>
  turnout: number
  swingFromLastElection?: number
  wasHeld: boolean
  previousWinnerPartyId?: string
  previousWinnerPartyName?: string
  previousWinnerCandidateName?: string
  previousWinnerColour?: string
  previousMargin?: number
}
