import { describe, it, expect } from 'vitest'
import { describeIdeologyLean, describeMotionStakes, explainPartyWhip } from '../presentation'
import { makeMotion, makeParty, makeWorld } from '../../../test/builders'

describe('describeIdeologyLean', () => {
  it('summarises the strongest axes', () => {
    expect(describeIdeologyLean({ services: 22, growth: -12 })).toBe('less growth, more services')
  })
})

describe('describeMotionStakes', () => {
  it('names present blocs and a council cost', () => {
    const world = makeWorld({
      blocs: [
        { id: 'market_regulars', label: 'Market Regulars', summary: '', weight: 1, center: { change: 0, growth: 20, services: 10 }, preferredTags: [], avoidedTags: [], homeRole: 'market', concentration: 0.5 },
        { id: 'river_walkers', label: 'River Walkers', summary: '', weight: 1, center: { change: 20, growth: 0, services: 20 }, preferredTags: [], avoidedTags: [], homeRole: 'river', concentration: 0.5 },
      ],
    })
    const stakes = describeMotionStakes(world, {
      effects: [
        { blocId: 'market_regulars', utilityDelta: 0.1, salience: 1 },
        { blocId: 'river_walkers', utilityDelta: -0.05, salience: 1 },
        { blocId: 'college_corner', utilityDelta: 0.08, salience: 1 },
      ],
      costSignal: 0.6,
      ideologyLean: { services: 18 },
      kind: 'ordinary',
    })
    expect(stakes.helps).toEqual(['Market Regulars'])
    expect(stakes.hurts).toEqual(['River Walkers'])
    expect(stakes.cost).toBe('high')
    expect(stakes.costLabel).toMatch(/Expensive/)
  })
})

describe('explainPartyWhip', () => {
  it('explains a nay whip in plain English', () => {
    const party = makeParty({ id: 'party-a', values: { change: -40, growth: 40, services: -30 } })
    const world = makeWorld({ parties: [party], playerPartyId: 'party-a' })
    const motion = makeMotion({
      ideologyLean: { services: 22 },
      costSignal: 0.6,
      partyWhipDirection: { 'party-a': 'nay' },
    })
    expect(explainPartyWhip(world, 'party-a', motion)).toMatch(/Nay — too far from their platform/)
    expect(explainPartyWhip(world, 'party-a', motion)).toMatch(/expensive/)
  })
})
