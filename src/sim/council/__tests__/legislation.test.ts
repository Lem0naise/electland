import { describe, it, expect } from 'vitest'
import {
  enactPolicy,
  repealPolicy,
  getActivePolicies,
  getRepealablePolicies,
  scorePolicyReputationForTile,
  responsibilityForPolicy,
} from '../legislation'
import { makeWorld, makePolitician, makeMotion, makeEnactedPolicy, makeGovernment } from '../../../test/builders'
import type { World } from '../../../types/world'

function withPoliticianMode(world: World, activePolicies: ReturnType<typeof makeEnactedPolicy>[] = []): World {
  const politician = makePolitician()
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
      budgetEvents: [],
      autoCampaigns: [],
      legislationHistory: [],
      activePolicies,
    },
  }
}

describe('enactPolicy', () => {
  it('creates one EnactedPolicy from passed motion', () => {
    const world = withPoliticianMode(makeWorld({ week: 4, government: makeGovernment({ leadPartyId: 'party-a' }) }))
    const motion = makeMotion({
      id: 'motion-passed',
      kind: 'ordinary',
      effects: [{ blocId: 'bloc-1', utilityDelta: 0.1, salience: 1 }],
    })
    const next = enactPolicy(world, motion)
    expect(next.politicianMode!.activePolicies).toHaveLength(1)
    expect(next.politicianMode!.activePolicies[0]).toMatchObject({
      id: 'policy_motion-passed',
      originatingMotionId: 'motion-passed',
      sponsorPartyId: 'party-a',
      governmentLeadPartyIdAtPass: 'party-a',
      enactedWeek: 4,
    })
  })
})

describe('repealPolicy', () => {
  it('sets repealedWeek on target', () => {
    const policy = makeEnactedPolicy({ id: 'policy-1' })
    const world = withPoliticianMode(makeWorld({ week: 8 }), [policy])
    const next = repealPolicy(world, 'policy-1', 'repeal-motion-1')
    const repealed = next.politicianMode!.activePolicies[0]
    expect(repealed.repealedWeek).toBe(8)
    expect(repealed.repealedByMotionId).toBe('repeal-motion-1')
  })

  it('is no-op when policy already repealed', () => {
    const policy = makeEnactedPolicy({ id: 'policy-1', repealedWeek: 5, repealedByMotionId: 'old-repeal' })
    const world = withPoliticianMode(makeWorld({ week: 8 }), [policy])
    const next = repealPolicy(world, 'policy-1', 'repeal-motion-2')
    expect(next).toBe(world)
  })
})

describe('getActivePolicies', () => {
  it('excludes repealed policies', () => {
    const world = withPoliticianMode(makeWorld(), [
      makeEnactedPolicy({ id: 'active' }),
      makeEnactedPolicy({ id: 'repealed', repealedWeek: 3 }),
    ])
    const active = getActivePolicies(world)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('active')
  })
})

describe('getRepealablePolicies', () => {
  it('excludes budget and repeal motions', () => {
    const world = withPoliticianMode(makeWorld(), [
      makeEnactedPolicy({ id: 'services-policy', category: 'services' }),
      makeEnactedPolicy({ id: 'budget-policy', category: 'budget' }),
    ])
    world.politicianMode!.legislationHistory = [
      makeMotion({ id: 'repeal-motion', kind: 'repeal', category: 'services', status: 'passed' }),
    ]
    const repealable = getRepealablePolicies(world)
    expect(repealable.map((policy) => policy.id)).toEqual(['services-policy'])
  })
})

describe('scorePolicyReputationForTile', () => {
  it('returns 0 for repealed policy', () => {
    const world = withPoliticianMode(makeWorld({ week: 10 }), [
      makeEnactedPolicy({
        repealedWeek: 5,
        effects: [{ blocId: 'bloc-1', utilityDelta: 1, salience: 1 }],
      }),
    ])
    const tile = { blocMix: { 'bloc-1': 1 } }
    expect(scorePolicyReputationForTile(world, tile, 'party-a')).toBe(0)
  })
})

describe('responsibilityForPolicy', () => {
  it('gives sponsor full responsibility when sponsor is government lead', () => {
    const policy = makeEnactedPolicy({
      sponsorPartyId: 'party-a',
      governmentLeadPartyIdAtPass: 'party-a',
    })
    expect(responsibilityForPolicy(policy, 'party-a')).toBe(1.0)
    expect(responsibilityForPolicy(policy, 'party-b')).toBe(0)
  })

  it('splits responsibility 0.65/0.35 when sponsor is not government lead', () => {
    const policy = makeEnactedPolicy({
      sponsorPartyId: 'party-b',
      governmentLeadPartyIdAtPass: 'party-a',
    })
    expect(responsibilityForPolicy(policy, 'party-b')).toBe(0.65)
    expect(responsibilityForPolicy(policy, 'party-a')).toBe(0.35)
    expect(responsibilityForPolicy(policy, 'party-c')).toBe(0)
  })
})
