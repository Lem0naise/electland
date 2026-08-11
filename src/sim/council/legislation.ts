import type { World } from '../../types/world'
import type { EnactedPolicy, PolicyEffect, CouncilMotion } from '../../types/council'
import { getGovernmentLeadPartyId } from './voting'

export function getActivePolicies(world: World): EnactedPolicy[] {
  const pm = world.politicianMode
  if (!pm) return []
  return (pm.activePolicies ?? []).filter((policy) => policy.repealedWeek == null)
}

export function getRepealablePolicies(world: World): EnactedPolicy[] {
  return getActivePolicies(world).filter((policy) => policy.category !== 'budget')
}

export function responsibilityForPolicy(policy: EnactedPolicy, partyId: string): number {
  if (policy.sponsorPartyId === policy.governmentLeadPartyIdAtPass) {
    return policy.sponsorPartyId === partyId ? 1.0 : 0
  }
  if (partyId === policy.sponsorPartyId) return 0.65
  if (partyId === policy.governmentLeadPartyIdAtPass) return 0.35
  return 0
}

function salienceAtWeek(policy: EnactedPolicy, week: number): number {
  const age = Math.max(0, week - policy.enactedWeek)
  const decay = Math.max(0.25, 1 - age / 52)
  return decay
}

export function scorePolicyReputationForTile(
  world: World,
  tile: { blocMix: Record<string, number> },
  partyId: string,
): number {
  let score = 0
  for (const policy of getActivePolicies(world)) {
    const salience = salienceAtWeek(policy, world.week)
    const responsibility = responsibilityForPolicy(policy, partyId)
    if (responsibility <= 0) continue

    for (const effect of policy.effects) {
      const blocWeight = tile.blocMix[effect.blocId] ?? 0
      if (blocWeight <= 0.05) continue
      score += effect.utilityDelta * effect.salience * salience * blocWeight * responsibility
    }
  }
  return score
}

function effectsToBlocImpact(effects: PolicyEffect[]): Record<string, number> {
  return effects.reduce<Record<string, number>>((acc, effect) => {
    acc[effect.blocId] = (acc[effect.blocId] ?? 0) + Math.round(effect.utilityDelta * 100)
    return acc
  }, {})
}

export function enactPolicy(world: World, motion: CouncilMotion): World {
  const pm = world.politicianMode
  if (!pm || motion.kind !== 'ordinary') return world

  const enactment: EnactedPolicy = {
    id: `policy_${motion.id}`,
    originatingMotionId: motion.id,
    headline: motion.headline,
    category: motion.category,
    sponsorPartyId: motion.proposerPartyId,
    governmentLeadPartyIdAtPass: getGovernmentLeadPartyId(world) ?? motion.proposerPartyId,
    enactedWeek: world.week,
    effects: motion.effects.length > 0 ? motion.effects : policyEffectsFromBlocImpact(motion.blocImpact),
  }

  return {
    ...world,
    politicianMode: {
      ...pm,
      activePolicies: [...(pm.activePolicies ?? []), enactment],
    },
  }
}

export function repealPolicy(world: World, enactmentId: string, repealMotionId: string): World {
  const pm = world.politicianMode
  if (!pm) return world

  const target = (pm.activePolicies ?? []).find((policy) => policy.id === enactmentId && policy.repealedWeek == null)
  if (!target) return world

  return {
    ...world,
    politicianMode: {
      ...pm,
      activePolicies: (pm.activePolicies ?? []).map((policy) => (
        policy.id === enactmentId
          ? { ...policy, repealedWeek: world.week, repealedByMotionId: repealMotionId }
          : policy
      )),
    },
  }
}

function policyEffectsFromBlocImpact(blocImpact: Record<string, number>): PolicyEffect[] {
  return Object.entries(blocImpact).map(([blocId, impact]) => ({
    blocId,
    utilityDelta: impact / 100,
    salience: 1,
  }))
}

export function blocImpactFromEffects(effects: PolicyEffect[]): Record<string, number> {
  return effectsToBlocImpact(effects)
}
