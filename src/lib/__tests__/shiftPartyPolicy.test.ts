import { describe, it, expect } from 'vitest'
import { applyPoliticianAction, getPoliticianActions, strategyTagsForValues } from '../sim'
import { makeCouncillor, makeParty, makePolitician, makeWorld } from '../../test/builders'
import type { PoliticianAction } from '../sim'
import type { World } from '../../types/world'

function withPoliticianMode(world: World, polOverrides?: Parameters<typeof makePolitician>[0]): World {
  const politician = makePolitician(polOverrides)
  return {
    ...world,
    politicianMode: {
      politician,
      councillors: [makeCouncillor({ id: politician.id, wardId: politician.wardId, partyId: politician.partyId })],
      sessionHistory: [],
      nextSessionWeek: 8,
      councilSessionInterval: 8,
      nextBudgetWeek: 24,
      budgetHistory: [],
      budgetEvents: [],
      autoCampaigns: [],
      legislationHistory: [],
      activePolicies: [],
    },
  }
}

function partyShift(overrides?: Partial<PoliticianAction>): PoliticianAction {
  return {
    type: 'shift_party_policy',
    label: 'Set party platform',
    description: 'Move the party platform',
    apCost: 1,
    policyAxis: 'change',
    policyDirection: 1,
    ...overrides,
  }
}

function personalShift(overrides?: Partial<PoliticianAction>): PoliticianAction {
  return {
    type: 'shift_personal_policy',
    label: 'Set personal position',
    description: 'Move your own public position',
    apCost: 1,
    policyAxis: 'change',
    policyDirection: 1,
    ...overrides,
  }
}

describe('shift_party_policy', () => {
  it('is offered only to party leaders', () => {
    const backbencher = withPoliticianMode(makeWorld(), { careerRank: 'backbencher' })
    const chair = withPoliticianMode(makeWorld(), { careerRank: 'committee-chair' })
    const leader = withPoliticianMode(makeWorld(), { careerRank: 'party-leader' })

    expect(getPoliticianActions(backbencher).some((action) => action.type === 'shift_party_policy')).toBe(false)
    expect(getPoliticianActions(chair).some((action) => action.type === 'shift_party_policy')).toBe(false)
    expect(getPoliticianActions(leader).some((action) => action.type === 'shift_party_policy')).toBe(true)
  })

  it('moves party.values and strategyTags without changing personalValues', () => {
    const party = makeParty({ values: { change: 15, growth: 0, services: 0 } })
    const world = withPoliticianMode(makeWorld({
      parties: [party],
      playerPartyId: party.id,
    }), {
      careerRank: 'party-leader',
      partyId: party.id,
      personalValues: { change: 15, growth: 0, services: 0 },
    })

    const { world: next, result } = applyPoliticianAction(world, partyShift())
    const nextParty = next.parties.find((entry) => entry.id === party.id)

    expect(result.outcome).toBe('success')
    expect(nextParty?.values).toEqual({ change: 25, growth: 0, services: 0 })
    expect(nextParty?.strategyTags).toEqual(strategyTagsForValues({ change: 25, growth: 0, services: 0 }))
    expect(next.politicianMode?.politician.personalValues).toEqual({ change: 15, growth: 0, services: 0 })
    expect(next.policyShiftUsedThisCycle).toBe(true)
  })

  it('is a no-op on a second attempt in the same cycle', () => {
    const party = makeParty({ values: { change: 15, growth: 0, services: 0 } })
    const world = withPoliticianMode(makeWorld({
      parties: [party],
      playerPartyId: party.id,
      playerActionPoints: 1,
    }), { careerRank: 'party-leader', partyId: party.id })

    const first = applyPoliticianAction(world, partyShift())
    const second = applyPoliticianAction({ ...first.world, playerActionPoints: 1 }, partyShift({ policyDirection: -1 }))
    const nextParty = second.world.parties.find((entry) => entry.id === party.id)

    expect(second.result.outcome).toBe('neutral')
    expect(nextParty?.values).toEqual({ change: 25, growth: 0, services: 0 })
    expect(second.world.policyShiftUsedThisCycle).toBe(true)
  })

  it('does not let a personal position change move the party', () => {
    const party = makeParty({ values: { change: 15, growth: 0, services: 0 } })
    const world = withPoliticianMode(makeWorld({
      parties: [party],
      playerPartyId: party.id,
    }), {
      careerRank: 'party-leader',
      partyId: party.id,
      personalValues: { change: 15, growth: 0, services: 0 },
    })

    const { world: next } = applyPoliticianAction(world, personalShift())
    const nextParty = next.parties.find((entry) => entry.id === party.id)

    expect(nextParty?.values).toEqual({ change: 15, growth: 0, services: 0 })
    expect(next.politicianMode?.politician.personalValues).toEqual({ change: 25, growth: 0, services: 0 })
    expect(next.policyShiftUsedThisCycle).toBe(false)
  })
})
