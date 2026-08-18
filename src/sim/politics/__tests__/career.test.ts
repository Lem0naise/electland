import { describe, it, expect } from 'vitest'
import {
  getNextRank,
  canPromoteToPartyWhip,
  canLaunchLeadershipChallenge,
  getCareerRequirements,
  promoteToPartyWhip,
  launchLeadershipChallenge,
  isPlayerMayor,
  reconcilePlayerOfficeAndVictory,
} from '../career'
import { gameReducer } from '../../../game/reducer'
import { makeWorld, makeParty, makePolitician, makeCouncillor, makeGovernment } from '../../../test/builders'
import type { World } from '../../../types/world'

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

describe('getNextRank', () => {
  it('returns correct progression', () => {
    expect(getNextRank('backbencher')).toBe('party-whip')
    expect(getNextRank('party-whip')).toBe('party-leader')
    expect(getNextRank('party-leader')).toBeNull()
  })
})

describe('canPromoteToPartyWhip', () => {
  it('requires incumbency, terms, motions, influence', () => {
    const eligible = withPoliticianMode(makeWorld(), {
      careerRank: 'backbencher',
      isIncumbent: true,
      termsServed: 1,
      motionsPassed: 2,
      influence: 20,
    })
    expect(canPromoteToPartyWhip(eligible)).toBe(true)

    expect(canPromoteToPartyWhip(withPoliticianMode(makeWorld(), {
      careerRank: 'backbencher',
      isIncumbent: false,
      termsServed: 1,
      motionsPassed: 2,
      influence: 20,
    }))).toBe(false)

    expect(canPromoteToPartyWhip(withPoliticianMode(makeWorld(), {
      careerRank: 'backbencher',
      isIncumbent: true,
      termsServed: 0,
      motionsPassed: 2,
      influence: 20,
    }))).toBe(false)

    expect(canPromoteToPartyWhip(withPoliticianMode(makeWorld(), {
      careerRank: 'backbencher',
      isIncumbent: true,
      termsServed: 1,
      motionsPassed: 1,
      influence: 20,
    }))).toBe(false)

    expect(canPromoteToPartyWhip(withPoliticianMode(makeWorld(), {
      careerRank: 'backbencher',
      isIncumbent: true,
      termsServed: 1,
      motionsPassed: 2,
      influence: 19,
    }))).toBe(false)
  })
})

describe('canLaunchLeadershipChallenge', () => {
  it('requires incumbency, terms, influence, loyalty, support', () => {
    const base = withPoliticianMode(makeWorld(), {
      careerRank: 'party-whip',
      isIncumbent: true,
      termsServed: 2,
      influence: 100,
      partyLoyalty: 50,
      relationships: [{ targetId: 'c1', targetName: 'Ally', partyId: 'party-a', partyColour: '#000', wardId: 'ward-2', type: 'ally', strength: 40, history: [] }],
    })
    expect(canLaunchLeadershipChallenge(base)).toBe(true)

    expect(canLaunchLeadershipChallenge(withPoliticianMode(makeWorld(), {
      careerRank: 'party-whip',
      isIncumbent: false,
      termsServed: 2,
      influence: 100,
      partyLoyalty: 50,
    }))).toBe(false)

    expect(canLaunchLeadershipChallenge(withPoliticianMode(makeWorld(), {
      careerRank: 'party-whip',
      isIncumbent: true,
      termsServed: 1,
      influence: 100,
      partyLoyalty: 50,
    }))).toBe(false)

    expect(canLaunchLeadershipChallenge(withPoliticianMode(makeWorld(), {
      careerRank: 'party-whip',
      isIncumbent: true,
      termsServed: 2,
      influence: 99,
      partyLoyalty: 50,
    }))).toBe(false)

    expect(canLaunchLeadershipChallenge(withPoliticianMode(makeWorld(), {
      careerRank: 'party-whip',
      isIncumbent: true,
      termsServed: 2,
      influence: 100,
      partyLoyalty: 49,
    }))).toBe(false)

    expect(canLaunchLeadershipChallenge(withPoliticianMode(makeWorld(), {
      careerRank: 'party-whip',
      isIncumbent: true,
      termsServed: 2,
      influence: 100,
      partyLoyalty: 50,
      relationships: [],
    }))).toBe(false)
  })
})

describe('leadership support scaling', () => {
  it('scales to ~40% of total seats, capped by caucus size', () => {
    const smallWorld = withPoliticianMode(makeWorld(), { careerRank: 'party-whip' })
    smallWorld.politicianMode!.councillors = [
      makeCouncillor({ id: 'c1', partyId: 'party-a', wardId: 'ward-1' }),
      makeCouncillor({ id: 'c2', partyId: 'party-a', wardId: 'ward-2' }),
    ]
    const smallReqs = getCareerRequirements(smallWorld)
    const smallSupport = smallReqs?.requirements.find((req) => req.label === 'Party support')
    expect(smallSupport?.needed).toBe(1)

    const largeCaucus = withPoliticianMode(makeWorld(), { careerRank: 'party-whip' })
    largeCaucus.constituencies = Array.from({ length: 10 }, (_, i) => ({
      ...largeCaucus.constituencies[0],
      id: `ward-${i + 1}`,
      name: `Ward ${i + 1}`,
    }))
    largeCaucus.politicianMode!.councillors = Array.from({ length: 6 }, (_, i) => (
      makeCouncillor({ id: `c${i + 1}`, partyId: 'party-a', wardId: `ward-${i + 1}` })
    ))
    const largeReqs = getCareerRequirements(largeCaucus)
    const largeSupport = largeReqs?.requirements.find((req) => req.label === 'Party support')
    expect(largeSupport?.needed).toBe(4)
  })
})

describe('promoteToPartyWhip', () => {
  it('updates rank and adds career history', () => {
    const world = withPoliticianMode(makeWorld({ week: 5 }), {
      careerRank: 'backbencher',
      isIncumbent: true,
      termsServed: 1,
      motionsPassed: 2,
      influence: 20,
    })
    const next = promoteToPartyWhip(world)
    expect(next.politicianMode!.politician.careerRank).toBe('party-whip')
    expect(next.politicianMode!.politician.careerHistory.at(-1)?.rank).toBe('party-whip')
  })
})

describe('launchLeadershipChallenge', () => {
  it('updates rank and party leader name', () => {
    const world = withPoliticianMode(makeWorld(), {
      careerRank: 'party-whip',
      name: 'Jordan Lee',
      isIncumbent: true,
      termsServed: 2,
      influence: 100,
      partyLoyalty: 50,
      relationships: [{ targetId: 'c1', targetName: 'Ally', partyId: 'party-a', partyColour: '#000', wardId: 'ward-2', type: 'ally', strength: 40, history: [] }],
    })
    const next = launchLeadershipChallenge(world)
    expect(next.politicianMode!.politician.careerRank).toBe('party-leader')
    expect(next.parties.find((party) => party.id === 'party-a')?.leader).toBe('Jordan Lee')
  })
})

describe('isPlayerMayor', () => {
  it('returns true for party-leader with formed government lead', () => {
    const world = withPoliticianMode(makeWorld({
      government: makeGovernment({ leadPartyId: 'party-a', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'party-leader' })
    expect(isPlayerMayor(world)).toBe(true)
  })

  it('returns false for party-leader in opposition', () => {
    const world = withPoliticianMode(makeWorld({
      playerPartyId: 'party-a',
      parties: [makeParty({ id: 'party-a' }), makeParty({ id: 'party-b', name: 'Opposition', colour: '#111' })],
      government: makeGovernment({ leadPartyId: 'party-b', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'party-leader' })
    expect(isPlayerMayor(world)).toBe(false)
  })

  it('returns false for party-leader as junior coalition partner', () => {
    const world = withPoliticianMode(makeWorld({
      playerPartyId: 'party-a',
      parties: [makeParty({ id: 'party-a' }), makeParty({ id: 'party-b', name: 'Senior Partner', colour: '#111' })],
      government: makeGovernment({
        leadPartyId: 'party-b',
        partnerPartyIds: ['party-a'],
        status: 'formed',
        kind: 'coalition',
      }),
    }), { careerRank: 'party-leader' })
    expect(isPlayerMayor(world)).toBe(false)
  })
})

describe('reconcilePlayerOfficeAndVictory', () => {
  it('records victory once', () => {
    const mayorWorld = withPoliticianMode(makeWorld({
      week: 10,
      electionsHeld: 2,
      government: makeGovernment({ leadPartyId: 'party-a', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'party-leader' })

    const first = reconcilePlayerOfficeAndVictory(mayorWorld)
    expect(first.victory?.mayorFirstAchievedWeek).toBe(10)
    expect(first.victory?.mayorFirstAchievedElection).toBe(2)

    const second = reconcilePlayerOfficeAndVictory({ ...first, week: 15 })
    expect(second.victory?.mayorFirstAchievedWeek).toBe(10)
    expect(second.victory?.mayorFirstAchievedElection).toBe(2)
  })

  it('preserves victory screen acknowledgment', () => {
    const mayorWorld = withPoliticianMode(makeWorld({
      government: makeGovernment({ leadPartyId: 'party-a', status: 'formed', kind: 'majority' }),
    }), { careerRank: 'party-leader' })

    let world = reconcilePlayerOfficeAndVictory(mayorWorld)
    world = gameReducer(world, { type: 'ACKNOWLEDGE_VICTORY' })
    expect(world.victory?.victoryScreenSeen).toBe(true)

    world = reconcilePlayerOfficeAndVictory(world)
    expect(world.victory?.victoryScreenSeen).toBe(true)
  })

  it('losing government removes mayor status but keeps victory history', () => {
    const mayorWorld = withPoliticianMode(makeWorld({
      week: 10,
      electionsHeld: 2,
      government: makeGovernment({ leadPartyId: 'party-a', status: 'formed', kind: 'majority' }),
      victory: {
        mayorFirstAchievedWeek: 10,
        mayorFirstAchievedElection: 2,
        victoryScreenSeen: true,
      },
    }), { careerRank: 'party-leader' })

    const lostOffice = {
      ...mayorWorld,
      government: makeGovernment({ leadPartyId: 'party-b', status: 'formed', kind: 'majority' }),
    }

    expect(isPlayerMayor(lostOffice)).toBe(false)
    expect(lostOffice.victory?.mayorFirstAchievedWeek).toBe(10)
    expect(lostOffice.victory?.mayorFirstAchievedElection).toBe(2)
  })
})
