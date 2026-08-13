import { describe, it, expect } from 'vitest'
import { generateCouncilSession, generateBudgetSession, resolveCouncilSession } from '../agenda'
import { POLICY_TEMPLATES } from '../../../data/policyTemplates'
import { queueCustomMotion } from '../motions'
import { castPlayerVote } from '../../../lib/sim'
import { makeCouncillor, makeGovernment, makeParty, makePolitician, makeWorld } from '../../../test/builders'
import type { World } from '../../../types/world'

const templateHeadlines = new Set(POLICY_TEMPLATES.map((template) => template.headline.toLowerCase()))

function withCouncilWorld(overrides?: Partial<World>): World {
  const party = makeParty({ id: 'party-a' })
  const opposition = makeParty({ id: 'party-b', name: 'Civic League' })
  const politician = makePolitician({ partyId: 'party-a', isIncumbent: true, influence: 20 })
  return makeWorld({
    week: 8,
    playerPartyId: 'party-a',
    parties: [party, opposition],
    government: makeGovernment({ leadPartyId: 'party-a' }),
    blocs: [
      { id: 'market_regulars', label: 'Market Regulars', summary: '', weight: 1, center: { change: 0, growth: 20, services: 10 }, preferredTags: [], avoidedTags: [], homeRole: 'market', concentration: 0.5 },
      { id: 'workshop_crews', label: 'Workshop Crews', summary: '', weight: 1, center: { change: 0, growth: 10, services: 30 }, preferredTags: [], avoidedTags: [], homeRole: 'industrial', concentration: 0.5 },
      { id: 'river_walkers', label: 'River Walkers', summary: '', weight: 1, center: { change: 20, growth: 0, services: 20 }, preferredTags: [], avoidedTags: [], homeRole: 'river', concentration: 0.5 },
    ],
    politicianMode: {
      politician,
      councillors: [
        makeCouncillor({ id: 'cllr-a1', name: 'Avery', partyId: 'party-a', wardId: 'ward-2' }),
        makeCouncillor({ id: 'cllr-a2', name: 'Ash', partyId: 'party-a', wardId: 'ward-3' }),
        makeCouncillor({ id: 'cllr-b', name: 'Blair', partyId: 'party-b', wardId: 'ward-4' }),
      ],
      sessionHistory: [],
      nextSessionWeek: 8,
      councilSessionInterval: 8,
      nextOrdinaryKind: 'government',
      nextBudgetWeek: 24,
      budgetHistory: [],
      budgetEvents: [],
      autoCampaigns: [],
      legislationHistory: [],
      activePolicies: [],
    },
    ...overrides,
  })
}

function voteAndResolve(world: World): World {
  let next = world
  for (const motion of next.politicianMode!.currentSession!.motions) {
    next = castPlayerVote(next, motion.id, 'aye')
  }
  return resolveCouncilSession(next)
}

describe('generateCouncilSession', () => {
  it('opens with one government motion from policy templates', () => {
    const world = generateCouncilSession(withCouncilWorld())
    const session = world.politicianMode!.currentSession!

    expect(session.budgetSession).toBeFalsy()
    expect(session.kind).toBe('government')
    expect(session.motions).toHaveLength(1)
    expect(session.motions[0].kind).toBe('ordinary')
    expect(session.motions[0].headline.toLowerCase()).not.toContain('around victoria')
    expect(templateHeadlines.has(session.motions[0].headline.toLowerCase())).toBe(true)
  })

  it('alternates to a member session after government business resolves', () => {
    const first = voteAndResolve(generateCouncilSession(withCouncilWorld()))
    expect(first.politicianMode!.nextOrdinaryKind).toBe('member')

    const second = generateCouncilSession({
      ...first,
      week: first.politicianMode!.nextSessionWeek,
      politicianMode: {
        ...first.politicianMode!,
        currentSession: undefined,
      },
    })
    const session = second.politicianMode!.currentSession!
    expect(session.kind).toBe('member')
    expect(session.motions).toHaveLength(1)
    expect(templateHeadlines.has(session.motions[0].headline.toLowerCase())).toBe(true)
  })

  it('holds a queued player motion until the member session', () => {
    const queued = queueCustomMotion(withCouncilWorld(), {
      headline: 'Night Market Lighting',
      description: 'Light the stalls after dusk.',
      category: 'economy',
      ideologyLean: { change: 0, growth: 10, services: 10 },
      kind: 'ordinary',
    })
    const government = generateCouncilSession(queued)
    expect(government.politicianMode!.queuedMotion?.headline).toBe('Night Market Lighting')
    expect(government.politicianMode!.currentSession!.kind).toBe('government')
    expect(government.politicianMode!.currentSession!.motions[0].headline).not.toBe('Night Market Lighting')

    const afterGov = voteAndResolve(government)
    const member = generateCouncilSession({
      ...afterGov,
      week: afterGov.politicianMode!.nextSessionWeek,
      politicianMode: {
        ...afterGov.politicianMode!,
        currentSession: undefined,
      },
    })
    expect(member.politicianMode!.currentSession!.kind).toBe('member')
    expect(member.politicianMode!.currentSession!.motions[0].headline).toBe('Night Market Lighting')
    expect(member.politicianMode!.queuedMotion).toBeUndefined()
  })

  it('keeps template effects on blocs that exist in the town', () => {
    const world = generateCouncilSession(withCouncilWorld())
    const present = new Set(world.blocs.map((bloc) => bloc.id))
    for (const motion of world.politicianMode!.currentSession!.motions) {
      for (const effect of motion.effects) {
        expect(present.has(effect.blocId)).toBe(true)
      }
    }
  })

  it('builds a budget session with only the budget motion', () => {
    const world = generateBudgetSession(withCouncilWorld({ week: 24 }))
    const session = world.politicianMode!.currentSession!
    expect(session.kind).toBe('budget')
    expect(session.motions).toHaveLength(1)
    expect(session.motions[0].kind).toBe('budget')
  })
})

describe('resolveCouncilSession', () => {
  it('enacts a passed ordinary motion', () => {
    const base = withCouncilWorld()
    const queued = queueCustomMotion({
      ...base,
      politicianMode: { ...base.politicianMode!, nextOrdinaryKind: 'member' },
    }, {
      headline: 'Library Saturday Hours',
      description: 'Keep the branch open on Saturday mornings.',
      category: 'services',
      ideologyLean: { change: 0, growth: 0, services: 10 },
      kind: 'ordinary',
      costSignal: 0.1,
    })
    const opened = generateCouncilSession(queued)
    const motion = opened.politicianMode!.currentSession!.motions[0]
    const committed = {
      ...opened,
      politicianMode: {
        ...opened.politicianMode!,
        currentSession: {
          ...opened.politicianMode!.currentSession!,
          motions: [{
            ...motion,
            playerVote: 'aye' as const,
            votes: [
              { councillorId: 'cllr-a1', councillorName: 'Avery', partyId: 'party-a', vote: 'aye' as const },
              { councillorId: 'cllr-a2', councillorName: 'Ash', partyId: 'party-a', vote: 'aye' as const },
              { councillorId: 'cllr-b', councillorName: 'Blair', partyId: 'party-b', vote: 'aye' as const },
            ],
          }],
        },
      },
    }
    const next = resolveCouncilSession(committed)
    expect(next.politicianMode!.currentSession!.motions[0].status).toBe('passed')
    expect(next.politicianMode!.activePolicies).toHaveLength(1)
    expect(next.politicianMode!.activePolicies[0]?.headline).toBe('Library Saturday Hours')
  })
})
