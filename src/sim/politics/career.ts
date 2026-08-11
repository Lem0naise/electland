import type { World } from '../../types/world'
import type { CareerRank, CareerTier, PoliticianState } from '../../types/politics'

export interface CareerRequirements {
  rank: CareerRank
  label: string
  requirements: Array<{ label: string; met: boolean; current: number; needed: number }>
  eligible: boolean
}

const RANK_LABELS: Record<CareerRank, string> = {
  backbencher: 'Backbencher',
  'committee-chair': 'Committee Chair',
  'party-leader': 'Party Leader',
}

const RANK_ORDER: CareerRank[] = ['backbencher', 'committee-chair', 'party-leader']

export function getNextRank(current: CareerRank): CareerRank | null {
  const idx = RANK_ORDER.indexOf(current)
  return idx >= 0 && idx < RANK_ORDER.length - 1 ? RANK_ORDER[idx + 1] : null
}

export function getRankLabel(rank: CareerRank): string {
  return RANK_LABELS[rank]
}

function politicalSupportCounts(world: World, pol: PoliticianState): { supporters: number; requiredSupporters: number } {
  const pm = world.politicianMode
  if (!pm) return { supporters: 0, requiredSupporters: 0 }
  const samePartyCouncillors = pm.councillors.filter((c) => c.partyId === pol.partyId)
  const supporters = pol.relationships.filter(
    (r) => r.partyId === pol.partyId && r.strength >= 40,
  ).length
  const requiredSupporters = Math.min(3, samePartyCouncillors.length)
  return { supporters, requiredSupporters }
}

function requirementsForRank(world: World, rank: CareerRank, pol: PoliticianState): CareerRequirements['requirements'] {
  switch (rank) {
    case 'committee-chair':
      return [
        { label: 'Incumbent councillor', met: pol.isIncumbent, current: pol.isIncumbent ? 1 : 0, needed: 1 },
        { label: 'Terms served', met: pol.termsServed >= 1, current: pol.termsServed, needed: 1 },
        { label: 'Motions passed', met: pol.motionsPassed >= 2, current: pol.motionsPassed, needed: 2 },
        { label: 'Influence', met: pol.influence >= 20, current: pol.influence, needed: 20 },
      ]
    case 'party-leader': {
      const { supporters, requiredSupporters } = politicalSupportCounts(world, pol)
      return [
        { label: 'Incumbent councillor', met: pol.isIncumbent, current: pol.isIncumbent ? 1 : 0, needed: 1 },
        { label: 'Terms served', met: pol.termsServed >= 2, current: pol.termsServed, needed: 2 },
        { label: 'Influence', met: pol.influence >= 60, current: pol.influence, needed: 60 },
        { label: 'Reputation', met: pol.reputation >= 60, current: pol.reputation, needed: 60 },
        { label: 'Party loyalty', met: pol.partyLoyalty >= 50, current: pol.partyLoyalty, needed: 50 },
        {
          label: 'Party support',
          met: requiredSupporters === 0 || supporters >= requiredSupporters,
          current: supporters,
          needed: requiredSupporters,
        },
      ]
    }
    default:
      return []
  }
}

export function getCareerRequirements(world: World): CareerRequirements | null {
  const pm = world.politicianMode
  if (!pm) return null
  const nextRank = getNextRank(pm.politician.careerRank)
  if (!nextRank) return null
  const requirements = requirementsForRank(world, nextRank, pm.politician)
  const eligible = requirements.every((req) => req.met)
  return { rank: nextRank, label: RANK_LABELS[nextRank], requirements, eligible }
}

export function canPromoteToCommitteeChair(world: World): boolean {
  const pm = world.politicianMode
  if (!pm) return false
  const pol = pm.politician
  if (pol.careerRank !== 'backbencher') return false
  return pol.isIncumbent
    && pol.termsServed >= 1
    && pol.motionsPassed >= 2
    && pol.influence >= 20
}

export function canLaunchLeadershipChallenge(world: World): boolean {
  const pm = world.politicianMode
  if (!pm) return false
  const pol = pm.politician
  if (pol.careerRank !== 'committee-chair') return false
  const { supporters, requiredSupporters } = politicalSupportCounts(world, pol)
  return pol.isIncumbent
    && pol.termsServed >= 2
    && pol.influence >= 60
    && pol.reputation >= 60
    && pol.partyLoyalty >= 50
    && (requiredSupporters === 0 || supporters >= requiredSupporters)
}

function careerEvent(week: number, description: string, rank: CareerRank): PoliticianState['careerHistory'][number] {
  const tier = rank as CareerTier
  return { week, description, rank, tier }
}

export function promoteToCommitteeChair(world: World): World {
  if (!canPromoteToCommitteeChair(world) || !world.politicianMode) return world
  const pm = world.politicianMode
  const pol = pm.politician
  const nextRank: CareerRank = 'committee-chair'
  const promotedPol: PoliticianState = {
    ...pol,
    careerRank: nextRank,
    careerHistory: [
      ...pol.careerHistory,
      careerEvent(world.week, `Promoted to ${RANK_LABELS[nextRank]}`, nextRank),
    ],
    influence: pol.influence + 10,
  }
  return {
    ...world,
    politicianMode: { ...pm, politician: promotedPol },
    newsFeed: [`Week ${world.week}: Cllr. ${pol.name} becomes ${RANK_LABELS[nextRank]}!`, ...world.newsFeed].slice(0, 30),
  }
}

export function launchLeadershipChallenge(world: World): World {
  if (!canLaunchLeadershipChallenge(world) || !world.politicianMode) return world
  const pm = world.politicianMode
  const pol = pm.politician
  const nextRank: CareerRank = 'party-leader'
  const promotedPol: PoliticianState = {
    ...pol,
    careerRank: nextRank,
    careerHistory: [
      ...pol.careerHistory,
      careerEvent(world.week, `Launched leadership challenge and became ${RANK_LABELS[nextRank]}`, nextRank),
    ],
    influence: pol.influence + 10,
  }
  return {
    ...world,
    parties: world.parties.map((party) =>
      party.id === world.playerPartyId ? { ...party, leader: pol.name } : party,
    ),
    politicianMode: { ...pm, politician: promotedPol },
    newsFeed: [`Week ${world.week}: Cllr. ${pol.name} wins the leadership and becomes ${RANK_LABELS[nextRank]}!`, ...world.newsFeed].slice(0, 30),
  }
}

export function isPlayerMayor(world: World): boolean {
  const pm = world.politicianMode
  if (!pm) return false
  if (pm.politician.careerRank !== 'party-leader') return false
  if (world.government?.status !== 'formed') return false
  return world.government.leadPartyId === world.playerPartyId
}

export function reconcilePlayerOfficeAndVictory(world: World): World {
  if (!isPlayerMayor(world)) return world
  if (world.victory?.mayorFirstAchievedWeek !== undefined) return world
  return {
    ...world,
    victory: {
      victoryScreenSeen: world.victory?.victoryScreenSeen ?? false,
      mayorFirstAchievedWeek: world.week,
      mayorFirstAchievedElection: world.electionsHeld,
    },
  }
}
