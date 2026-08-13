import type { CouncilMotion, Councillor, PolicyEffect } from '../../types/council'
import type { PoliticalValues, World } from '../../types/world'
import { getGoverningPartyIds, supportBandForValues } from './voting'

export type CostBand = 'low' | 'medium' | 'high'

export type MotionStakes = {
  helps: string[]
  hurts: string[]
  cost: CostBand
  costLabel: string
  lean: string
  budgetLines: string[]
}

function blocLabel(world: World, blocId: string): string {
  return world.blocs.find((bloc) => bloc.id === blocId)?.label ?? blocId
}

export function describeCost(costSignal: number): { cost: CostBand; costLabel: string } {
  if (costSignal < 0.35) return { cost: 'low', costLabel: 'Cheap for the council' }
  if (costSignal < 0.55) return { cost: 'medium', costLabel: 'A noticeable hit to the budget' }
  return { cost: 'high', costLabel: 'Expensive — squeezes other services' }
}

export function describeIdeologyLean(lean: Partial<PoliticalValues>): string {
  const parts: string[] = []
  const change = lean.change ?? 0
  const growth = lean.growth ?? 0
  const services = lean.services ?? 0
  if (change > 10) parts.push('more reform')
  else if (change < -10) parts.push('more caution')
  if (growth > 10) parts.push('more growth')
  else if (growth < -10) parts.push('less growth')
  if (services > 10) parts.push('more services')
  else if (services < -10) parts.push('less services')
  return parts.length > 0 ? parts.join(', ') : 'a modest shift'
}

function dominantLeanAxis(lean: Partial<PoliticalValues>): string | undefined {
  const axes: Array<{ key: string; label: string; value: number }> = [
    { key: 'change', label: 'reform', value: Math.abs(lean.change ?? 0) },
    { key: 'growth', label: 'growth', value: Math.abs(lean.growth ?? 0) },
    { key: 'services', label: 'services', value: Math.abs(lean.services ?? 0) },
  ]
  const top = [...axes].sort((a, b) => b.value - a.value)[0]
  return top && top.value >= 8 ? top.label : undefined
}

function effectsForTown(world: World, effects: PolicyEffect[]): PolicyEffect[] {
  const present = new Set(world.blocs.map((bloc) => bloc.id))
  return effects.filter((effect) => present.has(effect.blocId))
}

export function describeMotionStakes(world: World, motion: Pick<CouncilMotion, 'effects' | 'costSignal' | 'ideologyLean' | 'kind' | 'budgetProposal'>): MotionStakes {
  const { cost, costLabel } = describeCost(motion.costSignal ?? 0.4)
  const lean = describeIdeologyLean(motion.ideologyLean)
  const helps: string[] = []
  const hurts: string[] = []
  for (const effect of effectsForTown(world, motion.effects ?? [])) {
    const label = blocLabel(world, effect.blocId)
    if (effect.utilityDelta > 0.015) helps.push(label)
    else if (effect.utilityDelta < -0.015) hurts.push(label)
  }

  const budgetLines: string[] = []
  if (motion.kind === 'budget' && motion.budgetProposal) {
    for (const category of motion.budgetProposal.categories) {
      if (category.funding > 58) budgetLines.push(`${category.label}: extra funding`)
      else if (category.funding < 42) budgetLines.push(`${category.label}: squeezed`)
    }
  }

  return { helps, hurts, cost, costLabel, lean, budgetLines }
}

export function formatStakesLine(stakes: MotionStakes): string {
  const parts: string[] = []
  if (stakes.helps.length > 0) parts.push(`Helps ${stakes.helps.join(', ')}`)
  if (stakes.hurts.length > 0) parts.push(`hurts ${stakes.hurts.join(', ')}`)
  if (stakes.budgetLines.length > 0) parts.push(stakes.budgetLines.join('; '))
  parts.push(stakes.costLabel)
  return parts.join(' · ')
}

export function explainPartyWhip(world: World, partyId: string, motion: CouncilMotion): string {
  const party = world.parties.find((entry) => entry.id === partyId)
  if (!party) return ''
  const whip = motion.partyWhipDirection[partyId] ?? 'free'
  if (motion.kind === 'budget' && getGoverningPartyIds(world).has(partyId) && whip === 'aye') {
    return 'Aye — government must pass a budget'
  }
  const axis = dominantLeanAxis(motion.ideologyLean)
  const expensive = (motion.costSignal ?? 0) >= 0.5
  if (whip === 'aye') {
    return axis ? `Aye — close to their platform on ${axis}` : 'Aye — fits their platform'
  }
  if (whip === 'nay') {
    const far = `too far from their platform${axis ? ` on ${axis}` : ''}`
    return expensive ? `Nay — ${far}, and the bill is expensive` : `Nay — ${far}`
  }
  const band = supportBandForValues(party.values, motion)
  if (band === 'mixed') return 'Free — mixed views; members may decide'
  return 'Free — let members decide'
}

export function explainCouncillorStance(
  world: World,
  councillor: Councillor,
  motion: CouncilMotion,
): string {
  const committed = motion.votes.find((vote) => vote.councillorId === councillor.id)
  if (committed) return 'Lobbied commitment'
  const whip = motion.partyWhipDirection[councillor.partyId] ?? 'free'
  const relationship = world.politicianMode?.politician.relationships.find((entry) => entry.targetId === councillor.id)
  const notes: string[] = []
  if (whip === 'free') notes.push('Personal position')
  else notes.push(`Party whip: ${whip}`)
  if (relationship && relationship.strength > (councillor.partyId === world.playerPartyId ? 30 : 40)) {
    notes.push('may follow you')
  }
  if (whip !== 'free' && councillor.rebellionTendency >= 0.14) {
    notes.push('likely rebel')
  }
  return notes.join(' · ')
}
