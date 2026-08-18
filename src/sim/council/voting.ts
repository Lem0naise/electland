import type { World } from '../../types/world'
import type { CouncilMotion, Councillor } from '../../types/council'
import type { PoliticalValues } from '../../types/world'
import { VALUE_KEYS } from '../../types/world'
import { createRng } from '../core/random'

export type WhipDirection = 'aye' | 'nay' | 'free'

function valueDistance(a: PoliticalValues, b: PoliticalValues, salience: PoliticalValues) {
  let total = 0
  for (const key of VALUE_KEYS) {
    const diff = a[key] - b[key]
    total += diff * diff * salience[key]
  }
  return total
}

function motionLeanToValues(lean: Partial<PoliticalValues>): PoliticalValues {
  return { change: lean.change ?? 0, growth: lean.growth ?? 0, services: lean.services ?? 0 }
}

function ideologyDistanceToMotion(values: PoliticalValues, lean: Partial<PoliticalValues>) {
  return valueDistance(values, motionLeanToValues(lean), { change: 1, growth: 1, services: 1 })
}

function supportBand(
  values: PoliticalValues,
  motion: Pick<CouncilMotion, 'ideologyLean' | 'category' | 'costSignal' | 'contestedness'>,
) {
  const technicalAllowance = motion.contestedness === 'broad' ? 400 : 0
  const costPenalty = (motion.costSignal ?? 0.4) * 4200
  const distance = Math.max(0, ideologyDistanceToMotion(values, motion.ideologyLean) - technicalAllowance + costPenalty)
  const supportCut = motion.contestedness === 'broad' ? 2200 : motion.contestedness === 'divisive' ? 900 : 1400
  const opposeCut = motion.contestedness === 'broad' ? 7000 : motion.contestedness === 'divisive' ? 3200 : 4800
  if (distance <= supportCut) return 'support' as const
  if (distance >= opposeCut) return 'oppose' as const
  return 'mixed' as const
}

function rngLike(world: World, salt: string) {
  const key = `${world.seed}-${world.week}-${salt}`
  const roll = [...key].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
  return (Math.abs(roll) % 10000) / 10000
}

export function getGoverningPartyIds(world: World): Set<string> {
  const ids = new Set<string>()
  const gov = world.government
  if (!gov || gov.status !== 'formed') return ids
  ids.add(gov.leadPartyId)
  for (const partnerId of gov.partnerPartyIds) ids.add(partnerId)
  return ids
}

export function getGovernmentLeadPartyId(world: World): string | undefined {
  const gov = world.government
  if (!gov || gov.status !== 'formed') return undefined
  return gov.leadPartyId
}

export function isMinorityGovernment(world: World): boolean {
  return world.government?.kind === 'minority'
}

function freeVoteFromRoll(roll: number, personalBand: 'support' | 'oppose' | 'mixed', contestedness: CouncilMotion['contestedness']): 'aye' | 'nay' | 'abstain' {
  if (personalBand === 'support') {
    if (contestedness === 'broad') return roll < 0.82 ? 'aye' : 'abstain'
    if (roll < 0.33) return 'abstain'
    if (roll < 0.66) return 'aye'
    return 'nay'
  }
  if (personalBand === 'oppose') {
    if (contestedness === 'broad') return roll < 0.82 ? 'nay' : 'abstain'
    if (roll < 0.33) return 'abstain'
    if (roll < 0.66) return 'nay'
    return 'aye'
  }
  if (roll < 0.33) return 'abstain'
  if (roll < 0.66) return 'aye'
  return 'nay'
}

export function buildPartyWhips(world: World, motion: CouncilMotion): Record<string, WhipDirection> {
  const directions: Record<string, WhipDirection> = {}
  const governingIds = getGoverningPartyIds(world)
  const govLeadId = getGovernmentLeadPartyId(world)
  const pm = world.politicianMode

  for (const party of world.parties) {
    const band = supportBand(party.values, motion)
    let direction: WhipDirection = band === 'support' ? 'aye' : band === 'oppose' ? 'nay' : 'free'
    if (motion.contestedness === 'divisive' && band === 'support' && (motion.costSignal ?? 0) > 0.7 && rngLike(world, party.id) > 0.55) {
      direction = 'free'
    }
    if (governingIds.has(party.id) && motion.kind === 'budget') direction = 'aye'
    if (isMinorityGovernment(world) && !governingIds.has(party.id) && band === 'mixed') direction = 'free'
    directions[party.id] = direction
  }

  if (govLeadId && motion.kind === 'budget') {
    directions[govLeadId] = 'aye'
  }

  if (pm) {
    const playerPartyNPCs = pm.councillors.filter((councillor) => councillor.partyId === pm.politician.partyId)
    if (playerPartyNPCs.length === 0) directions[pm.politician.partyId] = 'free'
  }

  return directions
}

export function findWhipIssuer(world: World, partyId: string): Councillor | undefined {
  const pm = world.politicianMode
  if (!pm) return undefined
  if (partyId === pm.politician.partyId && (pm.politician.careerRank === 'party-whip' || pm.politician.careerRank === 'party-leader')) {
    return {
      id: pm.politician.id,
      name: pm.politician.name,
      partyId: pm.politician.partyId,
      partyColour: world.parties.find((p) => p.id === pm.politician.partyId)?.colour ?? '#888',
      wardId: pm.politician.wardId,
      wardName: world.constituencies.find((c) => c.id === pm.politician.wardId)?.name ?? '',
      personalValues: pm.politician.personalValues,
      rebellionTendency: 0,
      influence: pm.politician.influence,
    }
  }
  const partyCouncillors = pm.councillors.filter((councillor) => councillor.partyId === partyId)
  if (partyCouncillors.length === 0) return undefined
  return partyCouncillors.reduce((best, current) => (current.influence > best.influence ? current : best))
}

export function calculateNpcVote(
  world: World,
  councillorId: string,
  motion: CouncilMotion,
  whip: WhipDirection,
): 'aye' | 'nay' | 'abstain' {
  const pm = world.politicianMode
  if (!pm) return 'abstain'

  const cllr = pm.councillors.find((entry) => entry.id === councillorId)
  if (!cllr) return 'abstain'
  if (cllr.id === motion.proposerId) return 'aye'

  const committedVote = motion.votes.find((vote) => vote.councillorId === councillorId)
  if (committedVote) return committedVote.vote

  const rng = createRng(world.seed + world.week * 4441 + councillorId.length + motion.id.length)

  let baseVote: 'aye' | 'nay' | 'abstain'
  if (whip === 'free') {
    const personalBand = supportBand(cllr.personalValues, motion)
    baseVote = freeVoteFromRoll(rng(), personalBand, motion.contestedness)
  } else {
    baseVote = whip
  }

  const governingIds = getGoverningPartyIds(world)
  const governingBudgetWhip = motion.kind === 'budget' && whip !== 'free' && governingIds.has(cllr.partyId)
  const sameParty = cllr.partyId === pm.politician.partyId

  const playerIsWhipOrLeader = pm.politician.careerRank === 'party-whip' || pm.politician.careerRank === 'party-leader'
  if (sameParty && playerIsWhipOrLeader && motion.playerVote) {
    baseVote = motion.playerVote
  }

  const rebellionChance = (
    cllr.rebellionTendency
    + (motion.contestedness === 'divisive' ? 0.10 : motion.contestedness === 'contested' ? 0.04 : 0.01)
    + (isMinorityGovernment(world) ? 0.05 : 0)
    + (motion.costSignal * 0.05)
  ) * (governingBudgetWhip ? 0.45 : 1) * (sameParty ? 0.35 : 1)

  if (rng() < rebellionChance && whip !== 'free') {
    baseVote = whip === 'aye' ? 'nay' : 'aye'
  }

  const relationship = pm.politician.relationships.find((entry) => entry.targetId === cllr.id)
  if (!sameParty || !playerIsWhipOrLeader) {
    const followThreshold = sameParty ? 30 : 40
    const followChance = sameParty ? 0.40 : 0.18
    if (relationship && relationship.strength > followThreshold && rng() < followChance) {
      baseVote = motion.playerVote ?? baseVote
    }
  }

  return baseVote
}

export function motionPassed(votes: Array<{ vote: 'aye' | 'nay' | 'abstain' }>): boolean {
  const ayes = votes.filter((entry) => entry.vote === 'aye').length
  const nays = votes.filter((entry) => entry.vote === 'nay').length
  return ayes > nays
}

export function supportBandForValues(values: PoliticalValues, motion: CouncilMotion) {
  return supportBand(values, motion)
}

export type PredictedStance = 'aye' | 'lean_aye' | 'undecided' | 'lean_nay' | 'nay'

export function predictCouncillorVote(councillor: Councillor, motion: CouncilMotion, world: World): PredictedStance {
  if (councillor.id === motion.proposerId) return 'aye'
  const committedVote = motion.votes.find((vote) => vote.councillorId === councillor.id)
  if (committedVote) return committedVote.vote === 'aye' ? 'aye' : committedVote.vote === 'nay' ? 'nay' : 'undecided'
  const whip = motion.partyWhipDirection[councillor.partyId] ?? 'free'
  const personalLeans = supportBand(councillor.personalValues, motion)
  const rebellious = councillor.rebellionTendency + (world.government?.kind === 'minority' ? 0.1 : 0)
  if (whip === 'aye') {
    if (rebellious > 0.16 && personalLeans === 'oppose') return 'lean_aye'
    return 'aye'
  }
  if (whip === 'nay') {
    if (rebellious > 0.16 && personalLeans === 'support') return 'lean_nay'
    return 'nay'
  }
  if (personalLeans === 'support') return rebellious > 0.14 ? 'lean_aye' : 'aye'
  if (personalLeans === 'oppose') return rebellious > 0.14 ? 'lean_nay' : 'nay'
  return 'undecided'
}
