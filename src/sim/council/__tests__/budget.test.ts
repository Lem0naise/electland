import { describe, it, expect } from 'vitest'
import {
  canProposeBudget,
  applyBudgetEffects,
  aggregateBudgetBlocEffects,
  recordBudgetEvent,
  handleBudgetFailure,
  getDefaultBudget,
} from '../budget'
import { makeWorld, makePolitician, makeGovernment } from '../../../test/builders'
import type { World } from '../../../types/world'
import type { Budget } from '../../../types/world'

function withPoliticianMode(world: World, polOverrides?: Parameters<typeof makePolitician>[0], budgetEvents?: NonNullable<World['politicianMode']>['budgetEvents']): World {
  const politician = makePolitician(polOverrides)
  return {
    ...world,
    politicianMode: {
      politician,
      councillors: [],
      sessionHistory: [],
      nextSessionWeek: 8,
      councilSessionInterval: 8,
      nextBudgetWeek: 24,
      budgetHistory: [],
      budgetEvents: budgetEvents ?? [],
      autoCampaigns: [],
      legislationHistory: [],
      activePolicies: [],
    },
  }
}

describe('canProposeBudget', () => {
  it('requires party-leader and government lead', () => {
    const eligible = withPoliticianMode(makeWorld({
      government: makeGovernment({ leadPartyId: 'party-a', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'party-leader', careerTier: 'party-leader', partyId: 'party-a' })
    expect(canProposeBudget(eligible)).toBe(true)

    expect(canProposeBudget(withPoliticianMode(makeWorld({
      government: makeGovernment({ leadPartyId: 'party-a', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'committee-chair', careerTier: 'committee-chair', partyId: 'party-a' }))).toBe(false)

    expect(canProposeBudget(withPoliticianMode(makeWorld({
      government: makeGovernment({ leadPartyId: 'party-b', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'party-leader', careerTier: 'party-leader', partyId: 'party-a' }))).toBe(false)
  })
})

describe('applyBudgetEffects', () => {
  it('aggregates duplicate bloc entries via aggregateBudgetBlocEffects', () => {
    const budget: Budget = {
      totalBudget: 200,
      categories: [
        { id: 'roads', label: 'Roads', funding: 60, blocs: ['shared_bloc'] },
        { id: 'parks', label: 'Parks', funding: 60, blocs: ['shared_bloc'] },
        { id: 'libraries', label: 'Libraries', funding: 50, blocs: ['other_bloc'] },
        { id: 'safety', label: 'Safety', funding: 50, blocs: ['other_bloc'] },
      ],
    }
    const effects = aggregateBudgetBlocEffects(budget)
    expect(effects.shared_bloc).toBeCloseTo(4)
    const world = applyBudgetEffects(makeWorld(), budget)
    expect(world.budget.categories).toHaveLength(4)
  })
})

describe('recordBudgetEvent', () => {
  it('appends to budgetEvents', () => {
    const world = withPoliticianMode(makeWorld({ week: 6 }))
    const budget = getDefaultBudget()
    const next = recordBudgetEvent(world, 'passed', 'party-a', budget, 'budget-motion-1')
    expect(next.politicianMode!.budgetEvents).toHaveLength(1)
    expect(next.politicianMode!.budgetEvents[0]).toMatchObject({
      week: 6,
      outcome: 'passed',
      proposerPartyId: 'party-a',
      motionId: 'budget-motion-1',
    })
  })
})

describe('handleBudgetFailure', () => {
  it('creates officer-imposed budget after three failures', () => {
    const world = withPoliticianMode(makeWorld({
      week: 20,
      electionCycleWeeks: 24,
      government: makeGovernment({ leadPartyId: 'party-a', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'party-leader' }, [
      { week: 10, outcome: 'failed', proposerPartyId: 'party-a', motionId: 'b1' },
      { week: 12, outcome: 'failed', proposerPartyId: 'party-a', motionId: 'b2' },
      { week: 14, outcome: 'failed', proposerPartyId: 'party-a', motionId: 'b3' },
    ])
    world.politicianMode!.proposedBudget = getDefaultBudget()

    const next = handleBudgetFailure(world)
    const events = next.politicianMode!.budgetEvents ?? []
    const lastEvent = events[events.length - 1]
    expect(lastEvent.outcome).toBe('officer-imposed')
    expect(events.filter((event) => event.outcome === 'passed')).toHaveLength(0)
    expect(next.politicianMode!.proposedBudget).toBeUndefined()
  })
})
