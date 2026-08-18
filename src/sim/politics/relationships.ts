import { clamp } from '../core/math'
import type { World } from '../../types/world'
import type { Relationship } from '../../types/politics'
import type { CouncilMotion } from '../../types/council'

export function getRelationshipLabel(strength: number): 'ally' | 'rival' | 'neutral' {
  if (strength > 40) return 'ally'
  if (strength < -30) return 'rival'
  return 'neutral'
}

export function updateRelationship(world: World, targetId: string, delta: number, reason: string): World {
  const pm = world.politicianMode
  if (!pm) return world

  const existing = pm.politician.relationships.find((entry) => entry.targetId === targetId)
  if (!existing) return world

  const strength = clamp(existing.strength + delta, -100, 100)
  const type: Relationship['type'] =
    strength > 40 ? 'ally'
    : strength < -30 ? 'rival'
    : existing.type === 'mentor' ? 'mentor'
    : 'neutral'

  const relationships = pm.politician.relationships.map((entry) => {
    if (entry.targetId !== targetId) return entry
    return {
      ...entry,
      strength,
      type,
      history: [...entry.history, reason].slice(-8),
    }
  })

  return {
    ...world,
    politicianMode: {
      ...pm,
      politician: {
        ...pm.politician,
        relationships,
      },
    },
  }
}

export function affinityKey(a: string, b: string): string {
  return [a, b].sort().join('_')
}

const PACT_AFFINITY_BONUS = 15

function activePactBonus(world: World, partyA: string, partyB: string): number {
  const pacts = world.electoralPacts ?? []
  const hasPact = pacts.some((p) =>
    p.status === 'active' && p.partyIds.includes(partyA) && p.partyIds.includes(partyB),
  )
  return hasPact ? PACT_AFFINITY_BONUS : 0
}

export function playerPartyAffinity(world: World, targetPartyId: string): number {
  const pm = world.politicianMode
  if (!pm) return 50
  const rels = pm.politician.relationships.filter((r) => r.partyId === targetPartyId)
  if (rels.length === 0) return 50 + activePactBonus(world, world.playerPartyId, targetPartyId)
  const avg = rels.reduce((sum, r) => sum + r.strength, 0) / rels.length
  const base = Math.round((avg + 100) / 2)
  return clamp(base + activePactBonus(world, world.playerPartyId, targetPartyId), 0, 100)
}

export function npcPartyAffinity(world: World, partyA: string, partyB: string): number {
  const key = affinityKey(partyA, partyB)
  const raw = world.partyAffinityMatrix[key]
  const base = raw === undefined ? 50 : Math.round((raw + 100) / 2)
  return clamp(base + activePactBonus(world, partyA, partyB), 0, 100)
}

export interface AffinityExplanation {
  score: number
  components: Array<{ label: string; value: number }>
}

export function explainPlayerPartyAffinity(world: World, targetPartyId: string): AffinityExplanation {
  const pm = world.politicianMode
  const components: AffinityExplanation['components'] = []
  const rels = pm?.politician.relationships.filter((r) => r.partyId === targetPartyId) ?? []
  if (rels.length > 0) {
    const avg = rels.reduce((sum, r) => sum + r.strength, 0) / rels.length
    components.push({ label: `Avg. councillor relationship (${rels.length})`, value: Math.round((avg + 100) / 2) })
  } else {
    components.push({ label: 'No councillor relationships', value: 50 })
  }
  const pactBonus = activePactBonus(world, world.playerPartyId, targetPartyId)
  if (pactBonus > 0) components.push({ label: 'Active electoral pact', value: pactBonus })
  const score = playerPartyAffinity(world, targetPartyId)
  return { score, components }
}

export function explainNpcPartyAffinity(world: World, partyA: string, partyB: string): AffinityExplanation {
  const components: AffinityExplanation['components'] = []
  const key = affinityKey(partyA, partyB)
  const raw = world.partyAffinityMatrix[key]
  if (raw !== undefined) {
    components.push({ label: 'Council voting alignment', value: Math.round((raw + 100) / 2) })
  } else {
    components.push({ label: 'No voting history', value: 50 })
  }
  const pactBonus = activePactBonus(world, partyA, partyB)
  if (pactBonus > 0) components.push({ label: 'Active electoral pact', value: pactBonus })
  const score = npcPartyAffinity(world, partyA, partyB)
  return { score, components }
}

export function updatePartyAffinityMatrix(
  matrix: Record<string, number>,
  motions: CouncilMotion[],
  partyIds: string[],
): Record<string, number> {
  const resolved = motions.filter((m) => m.status === 'passed' || m.status === 'failed')
  if (resolved.length === 0) return matrix

  const updated = { ...matrix }
  for (let i = 0; i < partyIds.length; i++) {
    for (let j = i + 1; j < partyIds.length; j++) {
      const a = partyIds[i]
      const b = partyIds[j]
      const key = affinityKey(a, b)
      let delta = 0
      for (const motion of resolved) {
        const votesA = motion.votes.filter((v) => {
          const cllrParty = v.partyId
          return cllrParty === a && v.vote !== 'abstain'
        })
        const votesB = motion.votes.filter((v) => {
          const cllrParty = v.partyId
          return cllrParty === b && v.vote !== 'abstain'
        })
        if (votesA.length === 0 || votesB.length === 0) continue
        const ayeA = votesA.filter((v) => v.vote === 'aye').length / votesA.length
        const ayeB = votesB.filter((v) => v.vote === 'aye').length / votesB.length
        const agreement = 1 - Math.abs(ayeA - ayeB)
        delta += (agreement - 0.5) * 6
      }
      const prev = updated[key] ?? 0
      updated[key] = clamp(prev + delta, -100, 100)
    }
  }
  return updated
}
