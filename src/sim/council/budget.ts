import type { World, Budget, PoliticalValues } from '../../types/world'
import type { BudgetEvent, BudgetOutcome } from '../../types/council'
import { clamp } from '../core/math'

export function getDefaultBudget(): Budget {
  return {
    totalBudget: 200,
    categories: [
      { id: 'roads', label: 'Roads & transport', funding: 50, blocs: ['workshop_crews', 'market_regulars', 'river_walkers'] },
      { id: 'parks', label: 'Parks & environment', funding: 50, blocs: ['river_walkers', 'pondside_peacemakers', 'college_corner'] },
      { id: 'libraries', label: 'Libraries & culture', funding: 50, blocs: ['old_town_loyalists', 'college_corner', 'hill_street_households'] },
      { id: 'safety', label: 'Safety & care', funding: 50, blocs: ['pondside_peacemakers', 'hill_street_households', 'workshop_crews'] },
    ],
  }
}

export function normalizeBudget(budget: Budget): Budget {
  const defaults = getDefaultBudget()
  if (!budget?.categories?.length) return defaults
  const byId = Object.fromEntries(budget.categories.map((category: Budget['categories'][number]) => [category.id, category]))
  const summedFunding = (ids: string[], fallback: number) => {
    const present = ids.map((id) => byId[id]).filter(Boolean)
    if (present.length === 0) return fallback
    return present.reduce((sum, category) => sum + category.funding, 0)
  }
  const categories = [
    { id: 'roads', label: 'Roads & transport', funding: summedFunding(['roads', 'buses'], 50), blocs: defaults.categories[0].blocs },
    { id: 'parks', label: 'Parks & environment', funding: summedFunding(['parks'], 50), blocs: defaults.categories[1].blocs },
    { id: 'libraries', label: 'Libraries & culture', funding: summedFunding(['libraries', 'bins', 'youth'], 50), blocs: defaults.categories[2].blocs },
    { id: 'safety', label: 'Safety & care', funding: summedFunding(['safety'], 50), blocs: defaults.categories[3].blocs },
  ]
  const total = categories.reduce((sum, category) => sum + category.funding, 0)
  const target = defaults.totalBudget
  if (total !== target && total > 0) {
    const scale = target / total
    let remaining = target
    for (let i = 0; i < categories.length; i += 1) {
      if (i === categories.length - 1) categories[i].funding = remaining
      else {
        categories[i].funding = Math.round(categories[i].funding * scale)
        remaining -= categories[i].funding
      }
    }
  }
  return { totalBudget: target, categories }
}

export function budgetIdeologyLean(budget: Budget): PoliticalValues {
  const avg = (ids: string[]) => {
    const values = ids
      .map((id) => budget.categories.find((category: Budget['categories'][number]) => category.id === id)?.funding)
      .filter((value): value is number => typeof value === 'number')
    if (values.length === 0) return 50
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  return {
    change: Math.round(avg(['parks', 'libraries']) - 50),
    growth: Math.round(avg(['roads']) - 50),
    services: Math.round(avg(['libraries', 'safety', 'parks']) - 50),
  }
}

export function canProposeBudget(world: World): boolean {
  const pm = world.politicianMode
  if (!pm) return false
  const tier = pm.politician.careerTier ?? pm.politician.careerRank
  if (tier !== 'party-leader' && tier !== 'mayor') return false
  const gov = world.government
  if (!gov || gov.status !== 'formed') return false
  return gov.leadPartyId === pm.politician.partyId
}

export function aggregateBudgetBlocEffects(budget: Budget): Record<string, number> {
  return budget.categories.reduce<Record<string, number>>((acc: Record<string, number>, category: Budget['categories'][number]) => {
    const delta = (category.funding - 50) / 5
    for (const blocId of category.blocs) {
      acc[blocId] = (acc[blocId] ?? 0) + delta
    }
    return acc
  }, {})
}

export function applyBudgetEffects(world: World, budget: Budget): World {
  const normalized = normalizeBudget(budget)
  const blocImpact = aggregateBudgetBlocEffects(normalized)
  return {
    ...world,
    budget: normalized,
    tiles: world.tiles.map((tile) => {
      let approvalBoost = 0
      for (const category of normalized.categories) {
        const under = category.funding < 35
        const over = category.funding > 65
        if (!under && !over) continue
        const weight = category.blocs.reduce((sum: number, blocId: string) => sum + (tile.blocMix[blocId] ?? 0), 0)
        if (weight > 0.08) approvalBoost += (over ? 0.01 : -0.01) * weight
      }
      for (const [blocId, impact] of Object.entries(blocImpact)) {
        const blocWeight = tile.blocMix[blocId] ?? 0
        if (blocWeight > 0.1) approvalBoost += (impact / 100) * blocWeight * 0.015
      }
      if (approvalBoost === 0) return tile
      const existingBoost = tile.campaignBoosts?.[world.playerPartyId] ?? 0
      return {
        ...tile,
        campaignBoosts: {
          ...tile.campaignBoosts,
          [world.playerPartyId]: clamp(existingBoost + approvalBoost, 0, 0.4),
        },
      }
    }),
  }
}

export function recordBudgetEvent(
  world: World,
  outcome: BudgetOutcome,
  proposerPartyId: string,
  budget: Budget | undefined,
  motionId: string,
): World {
  const pm = world.politicianMode
  if (!pm) return world
  const event: BudgetEvent = {
    week: world.week,
    outcome,
    proposerPartyId,
    budget: budget ? normalizeBudget(budget) : undefined,
    motionId,
  }
  return {
    ...world,
    politicianMode: {
      ...pm,
      budgetEvents: [...(pm.budgetEvents ?? []), event],
      budgetHistory: [
        ...pm.budgetHistory,
        { week: world.week, passed: outcome === 'passed' },
      ],
    },
  }
}

function consecutiveBudgetFailures(events: BudgetEvent[]): number {
  let count = 0
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].outcome === 'passed' || events[i].outcome === 'officer-imposed') break
    if (events[i].outcome === 'failed') count += 1
  }
  return count
}

export function handleBudgetFailure(world: World): World {
  const pm = world.politicianMode
  if (!pm) return world
  const events = pm.budgetEvents ?? []
  const failures = consecutiveBudgetFailures(events)
  if (failures < 3) {
    return {
      ...world,
      politicianMode: {
        ...pm,
        proposedBudget: undefined,
        nextBudgetWeek: world.week + pm.councilSessionInterval,
      },
    }
  }

  const compromiseBudget = normalizeBudget(world.budget)
  let nextWorld = applyBudgetEffects(world, compromiseBudget)
  const govLead = world.government?.status === 'formed' ? world.government.leadPartyId : world.playerPartyId
  nextWorld = recordBudgetEvent(
    nextWorld,
    'officer-imposed',
    govLead,
    compromiseBudget,
    `officer_budget_${world.week}`,
  )
  const nextPm = nextWorld.politicianMode!
  return {
    ...nextWorld,
    politicianMode: {
      ...nextPm,
      proposedBudget: undefined,
      nextBudgetWeek: world.week + world.electionCycleWeeks,
    },
  }
}
