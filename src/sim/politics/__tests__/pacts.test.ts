import { describe, it, expect } from 'vitest'
import {
  getPlayerPacts,
  canManagePact,
  canWithdrawCommitment,
  withdrawCommitment,
  breakPact,
  completePactsForElection,
  pactScoringEffect,
} from '../pacts'
import { makeWorld, makeParty, makePolitician, makeCouncillor, makePact, makeCommitment } from '../../../test/builders'
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

function threePartyWorld(): World {
  return makeWorld({
    playerPartyId: 'party-a',
    parties: [
      makeParty({ id: 'party-a' }),
      makeParty({ id: 'party-b', name: 'Conservatives', colour: '#111' }),
      makeParty({ id: 'party-c', name: 'Greens', colour: '#0f0' }),
    ],
    constituencies: [
      {
        id: 'ward-1',
        name: 'Central Ward',
        seed: { x: 460, y: 320 },
        population: 5000,
        turnout: 0.5,
        urbanity: 0.5,
        tags: [],
        blocMix: { 'bloc-1': 1 },
        values: { change: 0, growth: 0, services: 0 },
        cellPath: '',
        results: [
          { partyId: 'party-a', partyName: 'Progressive Alliance', colour: '#2d5a27', voteShare: 40, votes: 2000 },
          { partyId: 'party-b', partyName: 'Conservatives', colour: '#111', voteShare: 35, votes: 1750 },
        ],
        leadingPartyId: 'party-a',
        leadingPartyName: 'Progressive Alliance',
        margin: 5,
        candidates: [],
        history: [],
        tacticalPressure: { 'party-a': 1, 'party-b': 1, 'party-c': 1 },
      },
      {
        id: 'ward-2',
        name: 'North Ward',
        seed: { x: 460, y: 100 },
        population: 4000,
        turnout: 0.5,
        urbanity: 0.5,
        tags: [],
        blocMix: { 'bloc-1': 1 },
        values: { change: 0, growth: 0, services: 0 },
        cellPath: '',
        results: [
          { partyId: 'party-a', partyName: 'Progressive Alliance', colour: '#2d5a27', voteShare: 30, votes: 1200 },
          { partyId: 'party-b', partyName: 'Conservatives', colour: '#111', voteShare: 40, votes: 1600 },
        ],
        leadingPartyId: 'party-b',
        leadingPartyName: 'Conservatives',
        margin: 10,
        candidates: [],
        history: [],
        tacticalPressure: { 'party-a': 1, 'party-b': 1, 'party-c': 1 },
      },
    ],
  })
}

describe('getPlayerPacts', () => {
  it('only returns pacts involving the player party', () => {
    const world = threePartyWorld()
    world.electoralPacts = [
      makePact({ id: 'pact-player', partyIds: ['party-a', 'party-b'] }),
      makePact({ id: 'pact-npc', partyIds: ['party-b', 'party-c'] }),
    ]
    const playerPacts = getPlayerPacts(world)
    expect(playerPacts).toHaveLength(1)
    expect(playerPacts[0].id).toBe('pact-player')
  })
})

describe('canManagePact', () => {
  it('returns false for NPC-NPC pact', () => {
    const world = withPoliticianMode(threePartyWorld(), { careerRank: 'party-leader' })
    const npcPact = makePact({ id: 'pact-npc', partyIds: ['party-b', 'party-c'] })
    expect(canManagePact(world, npcPact)).toBe(false)
  })
})

describe('canWithdrawCommitment', () => {
  it('allows non-leader to manage own ward commitment', () => {
    const world = withPoliticianMode(threePartyWorld(), { careerRank: 'committee-chair', wardId: 'ward-1' })
    const pact = makePact({
      commitments: [makeCommitment({ wardId: 'ward-1', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' })],
    })
    const commitment = pact.commitments[0]
    expect(canWithdrawCommitment(world, commitment, pact)).toBe(true)
  })

  it('blocks non-leader from managing another ward commitment', () => {
    const world = withPoliticianMode(threePartyWorld(), { careerRank: 'committee-chair', wardId: 'ward-1' })
    const pact = makePact({
      commitments: [makeCommitment({ id: 'c-other', wardId: 'ward-2', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' })],
    })
    expect(canWithdrawCommitment(world, pact.commitments[0], pact)).toBe(false)
  })

  it('allows party leader to manage all own-party commitments', () => {
    const world = withPoliticianMode(threePartyWorld(), { careerRank: 'party-leader', wardId: 'ward-1' })
    const pact = makePact({
      commitments: [
        makeCommitment({ id: 'c1', wardId: 'ward-1', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' }),
        makeCommitment({ id: 'c2', wardId: 'ward-2', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' }),
      ],
    })
    expect(canWithdrawCommitment(world, pact.commitments[0], pact)).toBe(true)
    expect(canWithdrawCommitment(world, pact.commitments[1], pact)).toBe(true)
  })
})

describe('withdrawCommitment', () => {
  it('leaves other commitments active', () => {
    const world = withPoliticianMode(threePartyWorld(), { careerRank: 'party-leader' })
    const pact = makePact({
      commitments: [
        makeCommitment({ id: 'c1', wardId: 'ward-1', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' }),
        makeCommitment({ id: 'c2', wardId: 'ward-2', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' }),
      ],
    })
    world.electoralPacts = [pact]
    const next = withdrawCommitment(world, pact.id, 'c1')
    const updated = next.electoralPacts[0]
    expect(updated.commitments.find((c) => c.id === 'c1')?.status).toBe('withdrawn')
    expect(updated.commitments.find((c) => c.id === 'c2')?.status).toBe('active')
    expect(updated.status).toBe('active')
  })
})

describe('breakPact', () => {
  it('marks all commitments withdrawn and pact broken', () => {
    const world = withPoliticianMode(threePartyWorld(), { careerRank: 'party-leader' })
    const pact = makePact({
      commitments: [
        makeCommitment({ id: 'c1', wardId: 'ward-1', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' }),
        makeCommitment({ id: 'c2', wardId: 'ward-2', standingDownPartyId: 'party-a', beneficiaryPartyId: 'party-b' }),
      ],
    })
    world.electoralPacts = [pact]
    const next = breakPact(world, pact.id)
    const updated = next.electoralPacts[0]
    expect(updated.status).toBe('broken')
    expect(updated.commitments.every((c) => c.status === 'withdrawn')).toBe(true)
  })
})

describe('completePactsForElection', () => {
  it('marks pacts completed after election', () => {
    const world = makeWorld({
      electoralPacts: [makePact({ electionNumber: 2, status: 'active' })],
    })
    const next = completePactsForElection(world, 2)
    expect(next.electoralPacts[0].status).toBe('completed')
    expect(next.electoralPacts[0].commitments[0].status).toBe('completed')
  })
})

describe('pactScoringEffect', () => {
  it('has no effect for completed pact', () => {
    const world = makeWorld({
      electoralPacts: [makePact({
        status: 'completed',
        commitments: [makeCommitment({
          wardId: 'ward-1',
          standingDownPartyId: 'party-a',
          beneficiaryPartyId: 'party-b',
          endorsementShare: 20,
          status: 'completed',
        })],
      })],
    })
    expect(pactScoringEffect(world, 'ward-1', 'party-a')).toEqual({ standingDown: false, endorsementBonus: 0 })
    expect(pactScoringEffect(world, 'ward-1', 'party-b')).toEqual({ standingDown: false, endorsementBonus: 0 })
  })

  it('sets standingDown for standing-down party', () => {
    const world = makeWorld({
      electoralPacts: [makePact({
        commitments: [makeCommitment({
          wardId: 'ward-1',
          standingDownPartyId: 'party-a',
          beneficiaryPartyId: 'party-b',
          endorsementShare: 15,
        })],
      })],
    })
    expect(pactScoringEffect(world, 'ward-1', 'party-a').standingDown).toBe(true)
  })

  it('gives endorsement bonus to beneficiary', () => {
    const world = makeWorld({
      electoralPacts: [makePact({
        commitments: [makeCommitment({
          wardId: 'ward-1',
          standingDownPartyId: 'party-a',
          beneficiaryPartyId: 'party-b',
          endorsementShare: 20,
        })],
      })],
    })
    expect(pactScoringEffect(world, 'ward-1', 'party-b').endorsementBonus).toBeCloseTo(0.2)
  })

  it('leaves unrelated ward unchanged', () => {
    const world = makeWorld({
      electoralPacts: [makePact({
        commitments: [makeCommitment({
          wardId: 'ward-1',
          standingDownPartyId: 'party-a',
          beneficiaryPartyId: 'party-b',
          endorsementShare: 20,
        })],
      })],
    })
    expect(pactScoringEffect(world, 'ward-2', 'party-a')).toEqual({ standingDown: false, endorsementBonus: 0 })
    expect(pactScoringEffect(world, 'ward-2', 'party-b')).toEqual({ standingDown: false, endorsementBonus: 0 })
  })
})
