import { calculateResults } from '../../lib/sim'
import { clamp } from '../core/math'
import type { Constituency, PartyPerformance, PoliticalValues, TownStats, World } from '../../types/world'
import type { AlliancePact, ElectoralPact, PactCommitment } from '../../types/politics'

export interface PactProposal {
  partnerPartyId: string
  commitments: Array<{
    standingDownPartyId: string
    wardId: string
    beneficiaryPartyId: string
  }>
}

export interface PactEvaluation {
  valid: boolean
  reasons: string[]
  acceptanceChance: number
  conflicts: Array<{ wardId: string; existingPactId: string }>
}

const ALLIANCE_IDEOLOGY_SCALE = 8000
const STANDING_DOWN_SCORE = -999
const TRUST_PENALTY_WITHDRAW = 0.15
const TRUST_PENALTY_BREAK = 0.3
const VALUE_KEYS = ['change', 'growth', 'services'] as const

function valueDistance(a: PoliticalValues, b: PoliticalValues, salience: PoliticalValues): number {
  return VALUE_KEYS.reduce((sum, key) => {
    const weight = salience[key] ?? 1
    return sum + Math.abs(a[key] - b[key]) * weight
  }, 0)
}

function pactTrustKey(partyAId: string, partyBId: string): string {
  return [partyAId, partyBId].sort().join('_')
}

function playerIsPartyLeader(world: World): boolean {
  return world.politicianMode?.politician.careerRank === 'party-leader'
}

function activePacts(world: World): ElectoralPact[] {
  return world.electoralPacts.filter((pact) => pact.status === 'active')
}

function activeCommitments(world: World): Array<PactCommitment & { pactId: string }> {
  const rows: Array<PactCommitment & { pactId: string }> = []
  for (const pact of activePacts(world)) {
    for (const commitment of pact.commitments) {
      if (commitment.status === 'active') {
        rows.push({ ...commitment, pactId: pact.id })
      }
    }
  }
  return rows
}

function rebuildStats(
  world: Omit<World, 'stats'> & { nationalResults: PartyPerformance[]; constituencies: World['constituencies'] },
): TownStats {
  const sortedByMargin = [...world.constituencies].sort((a, b) => a.margin - b.margin)
  const leader = world.nationalResults[0]
  const battlegroundWardIds = world.constituencies
    .filter((seat) => seat.margin < 10 && seat.margin >= 0)
    .map((seat) => seat.id)
  return {
    councilMajority: Math.floor(world.constituencies.length / 2) + 1,
    averageTurnout: world.constituencies.reduce((sum, seat) => sum + seat.turnout, 0) / Math.max(1, world.constituencies.length),
    projectedMayorParty: leader?.partyName ?? 'No one yet',
    projectedMayorLeader: leader?.leader ?? 'No one yet',
    projectedMayorWards: leader?.seatsWon ?? 0,
    closestWardName: sortedByMargin[0]?.name ?? 'None',
    closestWardMargin: sortedByMargin[0]?.margin ?? 0,
    safestWardName: sortedByMargin[sortedByMargin.length - 1]?.name ?? 'None',
    safestWardMargin: sortedByMargin[sortedByMargin.length - 1]?.margin ?? 0,
    totalWards: world.constituencies.length,
    battlegroundWardIds,
  }
}

function withRecalculatedResults(world: World): World {
  const results = calculateResults(world)
  const updated = {
    ...world,
    constituencies: results.constituencies,
    nationalResults: results.nationalResults,
  }
  return { ...updated, stats: rebuildStats(updated) }
}

function partyRankInWard(ward: Constituency, partyId: string): number {
  const idx = ward.results.findIndex((result) => result.partyId === partyId)
  return idx < 0 ? 99 : idx + 1
}

function estimateStandDownGain(
  ward: Constituency,
  standDownPartyId: string,
  beneficiaryPartyId: string,
): { gainPp: number; beforeShare: number; afterShare: number; wouldLead: boolean; flipsToBeneficiary: boolean } {
  const standDownShare = ward.results.find((result) => result.partyId === standDownPartyId)?.voteShare ?? 0
  const beforeShare = ward.results.find((result) => result.partyId === beneficiaryPartyId)?.voteShare ?? 0
  if (standDownShare <= 0 && beforeShare <= 0) {
    return { gainPp: 0, beforeShare: 0, afterShare: 0, wouldLead: false, flipsToBeneficiary: false }
  }

  const rawGain = standDownShare * 0.25
  const projected = new Map<string, number>()
  for (const result of ward.results) {
    if (result.partyId === standDownPartyId) projected.set(result.partyId, 0)
    else if (result.partyId === beneficiaryPartyId) projected.set(result.partyId, beforeShare + rawGain)
    else projected.set(result.partyId, result.voteShare)
  }
  if (!projected.has(beneficiaryPartyId)) projected.set(beneficiaryPartyId, beforeShare + rawGain)

  let total = 0
  for (const value of projected.values()) total += value
  if (total > 0) {
    for (const [id, value] of projected) projected.set(id, (value / total) * 100)
  }

  const afterShare = projected.get(beneficiaryPartyId) ?? 0
  const gainPp = afterShare - beforeShare
  let bestId = ''
  let bestShare = -1
  for (const [id, value] of projected) {
    if (value > bestShare) {
      bestShare = value
      bestId = id
    }
  }
  const wouldLead = bestId === beneficiaryPartyId
  const flipsToBeneficiary = wouldLead && ward.leadingPartyId !== beneficiaryPartyId
  return { gainPp, beforeShare, afterShare, wouldLead, flipsToBeneficiary }
}

function evaluateCommitmentAcceptance(
  world: World,
  standingDownPartyId: string,
  beneficiaryPartyId: string,
  wardId: string,
  beneficiaryWardId: string,
): number {
  const standingDownWard = world.constituencies.find((ward) => ward.id === wardId)
  const beneficiaryWard = world.constituencies.find((ward) => ward.id === beneficiaryWardId)
  const standingDownParty = world.parties.find((party) => party.id === standingDownPartyId)
  const beneficiaryParty = world.parties.find((party) => party.id === beneficiaryPartyId)
  if (!standingDownWard || !beneficiaryWard || !standingDownParty || !beneficiaryParty) return 0

  for (const commitment of activeCommitments(world)) {
    if (commitment.standingDownPartyId === standingDownPartyId && commitment.wardId === wardId) return STANDING_DOWN_SCORE
    if (commitment.standingDownPartyId === beneficiaryPartyId && commitment.wardId === beneficiaryWardId) return STANDING_DOWN_SCORE
  }

  if (beneficiaryWard.leadingPartyId === beneficiaryPartyId && (beneficiaryWard.margin ?? 0) > 5) {
    return STANDING_DOWN_SCORE
  }

  const isIncumbent = world.electionsHeld >= 1 && world.electionNightResults.some(
    (result) => result.wardId === beneficiaryWardId && result.winner?.partyId === beneficiaryPartyId,
  )
  if (isIncumbent) return STANDING_DOWN_SCORE

  const beneficiaryShare = beneficiaryWard.results.find((result) => result.partyId === beneficiaryPartyId)?.voteShare ?? 0
  const beneficiaryRank = partyRankInWard(beneficiaryWard, beneficiaryPartyId)
  const beneficiaryGain = estimateStandDownGain(standingDownWard, standingDownPartyId, beneficiaryPartyId)
  const partnerGain = estimateStandDownGain(beneficiaryWard, beneficiaryPartyId, standingDownPartyId)

  const ideologicalBonus = Math.max(
    0,
    1 - valueDistance(standingDownParty.values, beneficiaryParty.values, { change: 1, growth: 1, services: 1 }) / ALLIANCE_IDEOLOGY_SCALE,
  )
  const repPenalty = (world.pactTrust[pactTrustKey(standingDownPartyId, beneficiaryPartyId)] ?? 0) * 0.15

  const gainScore = beneficiaryGain.gainPp / 20
  const flipBonus = beneficiaryGain.flipsToBeneficiary
    ? 0.20
    : beneficiaryGain.wouldLead && !beneficiaryGain.flipsToBeneficiary
      ? 0.05
      : 0
  const allyCost = Math.min(1, beneficiaryShare / 25) * 0.45
  const closeSecondCost =
    beneficiaryRank === 2 && beneficiaryShare >= 10 && (beneficiaryWard.margin ?? 99) <= 12 ? 0.25 : 0
  const partnerUsefulness = Math.min(1, partnerGain.afterShare / 30) * 0.15

  return gainScore + flipBonus + partnerUsefulness + ideologicalBonus * 0.25 - allyCost - closeSecondCost - repPenalty
}

function acceptanceSeed(
  world: World,
  standingDownPartyId: string,
  beneficiaryPartyId: string,
  wardId: string,
  beneficiaryWardId: string,
): number {
  const str = `${world.seed}-${world.week}-${standingDownPartyId}-${beneficiaryPartyId}-${wardId}-${beneficiaryWardId}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % 10000) / 10000
}

function pairedCommitment(
  proposal: PactProposal,
  commitment: PactProposal['commitments'][number],
): { standingDownPartyId: string; wardId: string; beneficiaryPartyId: string; beneficiaryWardId: string } | null {
  const reverse = proposal.commitments.find(
    (entry) =>
      entry.standingDownPartyId === commitment.beneficiaryPartyId
      && entry.beneficiaryPartyId === commitment.standingDownPartyId,
  )
  if (!reverse) return null
  return {
    standingDownPartyId: commitment.standingDownPartyId,
    wardId: commitment.wardId,
    beneficiaryPartyId: commitment.beneficiaryPartyId,
    beneficiaryWardId: reverse.wardId,
  }
}

function endorsementShareForCommitment(world: World, wardId: string, partyId: string): number {
  const ward = world.constituencies.find((entry) => entry.id === wardId)
  return ward?.results.find((result) => result.partyId === partyId)?.voteShare ?? 0
}

function applyTrustPenalty(world: World, partyAId: string, partyBId: string, amount: number): World {
  const key = pactTrustKey(partyAId, partyBId)
  return {
    ...world,
    pactTrust: {
      ...world.pactTrust,
      [key]: (world.pactTrust[key] ?? 0) + amount,
    },
  }
}

function alliancePactToElectoralPact(world: World, proposal: AlliancePact): ElectoralPact {
  const partyIds = [proposal.partyAId, proposal.partyBId].sort() as [string, string]
  const commitments: PactCommitment[] = []
  let idx = 0
  for (const entry of proposal.entries) {
    idx += 1
    commitments.push({
      id: `pact-c-${world.seed}-${world.week}-${idx}`,
      standingDownPartyId: proposal.partyAId,
      wardId: entry.wardA,
      beneficiaryPartyId: proposal.partyBId,
      endorsementShare: entry.endorsementForB,
      status: 'active',
    })
    if (!entry.isUnilateral) {
      idx += 1
      commitments.push({
        id: `pact-c-${world.seed}-${world.week}-${idx}`,
        standingDownPartyId: proposal.partyBId,
        wardId: entry.wardB,
        beneficiaryPartyId: proposal.partyAId,
        endorsementShare: entry.endorsementForA,
        status: 'active',
      })
    }
  }
  return {
    id: proposal.id,
    partyIds,
    electionNumber: world.electionsHeld + 1,
    createdWeek: proposal.createdAtWeek,
    status: 'active',
    commitments,
  }
}

export function getPlayerPacts(world: World): ElectoralPact[] {
  return world.electoralPacts.filter(
    (pact) => pact.partyIds.includes(world.playerPartyId),
  )
}

export function canManagePact(world: World, pact: ElectoralPact): boolean {
  if (!playerIsPartyLeader(world)) return false
  return pact.partyIds.includes(world.playerPartyId)
}

export function canWithdrawCommitment(world: World, commitment: PactCommitment, pact: ElectoralPact): boolean {
  if (commitment.status !== 'active') return false
  if (pact.status !== 'active') return false
  if (!pact.partyIds.includes(world.playerPartyId)) return false
  if (commitment.standingDownPartyId !== world.playerPartyId) return false
  if (playerIsPartyLeader(world)) return true
  return world.politicianMode?.politician.wardId === commitment.wardId
}

export function evaluatePactProposal(world: World, proposal: PactProposal): PactEvaluation {
  const reasons: string[] = []
  const conflicts: PactEvaluation['conflicts'] = []
  const playerPartyId = world.playerPartyId
  const partnerParty = world.parties.find((party) => party.id === proposal.partnerPartyId)

  if (!playerIsPartyLeader(world)) {
    reasons.push('Only the party leader can negotiate pacts.')
  }
  if (!partnerParty) {
    reasons.push('Partner party not found.')
  }
  if (proposal.partnerPartyId === playerPartyId) {
    reasons.push('Cannot form a pact with your own party.')
  }
  if (proposal.commitments.length === 0) {
    reasons.push('At least one commitment is required.')
  }

  const partyIds = new Set([playerPartyId, proposal.partnerPartyId])
  for (const commitment of proposal.commitments) {
    if (!world.constituencies.some((ward) => ward.id === commitment.wardId)) {
      reasons.push(`Unknown ward: ${commitment.wardId}.`)
    }
    if (!partyIds.has(commitment.standingDownPartyId) || !partyIds.has(commitment.beneficiaryPartyId)) {
      reasons.push('Each commitment must involve the player party and the partner party.')
    }
    if (commitment.standingDownPartyId === commitment.beneficiaryPartyId) {
      reasons.push('A party cannot stand down for itself.')
    }

    for (const existing of activeCommitments(world)) {
      if (existing.wardId === commitment.wardId && existing.standingDownPartyId === commitment.standingDownPartyId) {
        conflicts.push({ wardId: commitment.wardId, existingPactId: existing.pactId })
      }
    }
  }

  if (conflicts.length > 0) {
    reasons.push('One or more wards already have active pact commitments.')
  }

  const evaluatedPairs = new Set<string>()
  const acceptanceScores: number[] = []
  for (const commitment of proposal.commitments) {
    const pair = pairedCommitment(proposal, commitment)
    if (!pair) continue
    const pairKey = [pair.wardId, pair.beneficiaryWardId].sort().join(':')
    if (evaluatedPairs.has(pairKey)) continue
    evaluatedPairs.add(pairKey)

    const baseChance = evaluateCommitmentAcceptance(
      world,
      pair.standingDownPartyId,
      pair.beneficiaryPartyId,
      pair.wardId,
      pair.beneficiaryWardId,
    )
    if (baseChance <= STANDING_DOWN_SCORE + 1) {
      acceptanceScores.push(0)
      continue
    }

    const totalSacrifice = proposal.commitments
      .filter((entry) => entry.standingDownPartyId === playerPartyId)
      .reduce((sum, entry) => sum + endorsementShareForCommitment(world, entry.wardId, playerPartyId) / 100, 0)
    const endorsementBonus = Math.min(0.50, totalSacrifice * 1.5)
    const countBonus = Math.min(0.15, Math.max(0, proposal.commitments.length - 1) * 0.03)
    const totalChance = clamp(baseChance + endorsementBonus + countBonus, 0, 0.85)
    const roll = acceptanceSeed(world, pair.standingDownPartyId, pair.beneficiaryPartyId, pair.wardId, pair.beneficiaryWardId)
    acceptanceScores.push(roll < totalChance ? totalChance : totalChance * 0.5)
  }

  const acceptanceChance = acceptanceScores.length > 0
    ? Math.round((acceptanceScores.reduce((sum, score) => sum + score, 0) / acceptanceScores.length) * 100)
    : 0

  return {
    valid: reasons.length === 0,
    reasons,
    acceptanceChance,
    conflicts,
  }
}

export function submitPactProposal(world: World, proposal: PactProposal): World {
  const evaluation = evaluatePactProposal(world, proposal)
  if (!evaluation.valid || evaluation.acceptanceChance < 15) return world

  const partyIds = [world.playerPartyId, proposal.partnerPartyId].sort() as [string, string]
  const existingPact = activePacts(world).find(
    (pact) => pact.partyIds[0] === partyIds[0] && pact.partyIds[1] === partyIds[1],
  )

  const newCommitments: PactCommitment[] = proposal.commitments.map((commitment, index) => ({
    id: `pact-c-${world.seed}-${world.week}-${world.electoralPacts.length}-${index}`,
    standingDownPartyId: commitment.standingDownPartyId,
    wardId: commitment.wardId,
    beneficiaryPartyId: commitment.beneficiaryPartyId,
    endorsementShare: endorsementShareForCommitment(world, commitment.wardId, commitment.standingDownPartyId),
    status: 'active',
  }))

  const electoralPacts = existingPact
    ? world.electoralPacts.map((pact) =>
      pact.id === existingPact.id
        ? { ...pact, commitments: [...pact.commitments, ...newCommitments] }
        : pact,
    )
    : [
      ...world.electoralPacts,
      {
        id: `pact-${world.seed}-${world.week}-${world.electoralPacts.length}`,
        partyIds,
        electionNumber: world.electionsHeld + 1,
        createdWeek: world.week,
        status: 'active' as const,
        commitments: newCommitments,
      },
    ]

  const partnerName = world.parties.find((party) => party.id === proposal.partnerPartyId)?.name ?? 'partner'
  return withRecalculatedResults({
    ...world,
    electoralPacts,
    newsFeed: [`Week ${world.week}: Pact agreed with ${partnerName}.`, ...world.newsFeed].slice(0, 30),
  })
}

export function acceptNpcProposal(world: World): World {
  const proposal = world.pendingNpcProposal
  if (!proposal || proposal.broken) return world
  if (!playerIsPartyLeader(world)) return world

  const playerInvolved = proposal.partyAId === world.playerPartyId || proposal.partyBId === world.playerPartyId
  if (!playerInvolved) return world

  const partnerId = proposal.partyAId === world.playerPartyId ? proposal.partyBId : proposal.partyAId
  const duplicate = activePacts(world).some(
    (pact) => pact.partyIds.includes(world.playerPartyId) && pact.partyIds.includes(partnerId),
  )
  if (duplicate) {
    return { ...world, pendingNpcProposal: undefined }
  }

  const electoralPact = alliancePactToElectoralPact(world, proposal)
  const partnerName = world.parties.find((party) => party.id === partnerId)?.name ?? 'partner'
  return withRecalculatedResults({
    ...world,
    pendingNpcProposal: undefined,
    electoralPacts: [...world.electoralPacts, electoralPact],
    newsFeed: [`Week ${world.week}: Accepted pact proposal from ${partnerName}.`, ...world.newsFeed].slice(0, 30),
  })
}

export function withdrawCommitment(world: World, pactId: string, commitmentId: string): World {
  const pact = world.electoralPacts.find((entry) => entry.id === pactId)
  if (!pact) return world
  const commitment = pact.commitments.find((entry) => entry.id === commitmentId)
  if (!commitment || !canWithdrawCommitment(world, commitment, pact)) return world
  if (commitment.status === 'withdrawn') return world

  const partnerId = pact.partyIds.find((id) => id !== world.playerPartyId) ?? pact.partyIds[1]
  const updatedPacts = world.electoralPacts.map((entry) => {
    if (entry.id !== pactId) return entry
    return {
      ...entry,
      commitments: entry.commitments.map((row) =>
        row.id === commitmentId ? { ...row, status: 'withdrawn' as const } : row,
      ),
    }
  })

  return withRecalculatedResults(
    applyTrustPenalty(
      { ...world, electoralPacts: updatedPacts },
      world.playerPartyId,
      partnerId,
      TRUST_PENALTY_WITHDRAW,
    ),
  )
}

export function breakPact(world: World, pactId: string): World {
  const pact = world.electoralPacts.find((entry) => entry.id === pactId)
  if (!pact || !canManagePact(world, pact)) return world
  if (pact.status === 'broken') return world

  const partnerId = pact.partyIds.find((id) => id !== world.playerPartyId) ?? pact.partyIds[1]
  const updatedPacts = world.electoralPacts.map((entry) => {
    if (entry.id !== pactId) return entry
    return {
      ...entry,
      status: 'broken' as const,
      brokenWeek: world.week,
      commitments: entry.commitments.map((commitment) =>
        commitment.status === 'active' ? { ...commitment, status: 'withdrawn' as const } : commitment,
      ),
    }
  })

  const partnerName = world.parties.find((party) => party.id === partnerId)?.name ?? 'partner'
  return withRecalculatedResults(
    applyTrustPenalty(
      {
        ...world,
        electoralPacts: updatedPacts,
        newsFeed: [`Week ${world.week}: Broke the pact with ${partnerName}.`, ...world.newsFeed].slice(0, 30),
      },
      world.playerPartyId,
      partnerId,
      TRUST_PENALTY_BREAK,
    ),
  )
}

export function completePactsForElection(world: World, electionNumber: number): World {
  let changed = false
  const electoralPacts = world.electoralPacts.map((pact) => {
    if (pact.status !== 'active' || pact.electionNumber !== electionNumber) return pact
    changed = true
    return {
      ...pact,
      status: 'completed' as const,
      completedWeek: world.week,
      commitments: pact.commitments.map((commitment) =>
        commitment.status === 'active' ? { ...commitment, status: 'completed' as const } : commitment,
      ),
    }
  })
  return changed ? { ...world, electoralPacts } : world
}

export function expireProposals(world: World): World {
  const proposal = world.pendingNpcProposal
  if (!proposal) return world
  const expired = proposal.broken || world.week > proposal.expiresWeek || world.weeksUntilElection <= 0
  return expired ? { ...world, pendingNpcProposal: undefined } : world
}

export function pactScoringEffect(
  world: World,
  wardId: string,
  partyId: string,
): { standingDown: boolean; endorsementBonus: number } {
  let standingDown = false
  let endorsementBonus = 0

  for (const pact of activePacts(world)) {
    for (const commitment of pact.commitments) {
      if (commitment.status !== 'active' || commitment.wardId !== wardId) continue
      if (commitment.standingDownPartyId === partyId) standingDown = true
      if (commitment.beneficiaryPartyId === partyId) {
        endorsementBonus += commitment.endorsementShare * 0.01
      }
    }
  }

  return { standingDown, endorsementBonus }
}
