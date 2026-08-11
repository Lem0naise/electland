import { describe, it, expect } from 'vitest'
import { parseSaveData } from '../persistence'
import { makeWorld, makePolitician, makeMotion, makeParty } from '../../test/builders'
import type { SaveData } from '../persistence'
import type { World } from '../../types/world'
import type { AlliancePact } from '../../types/politics'

function baseV2Save(world: World): SaveData {
  return {
    version: 2,
    savedAt: '2026-01-01T00:00:00.000Z',
    constituencyCount: 1,
    world,
    previousNationalResults: null,
  }
}

function withPoliticianMode(world: World): World {
  return {
    ...world,
    politicianMode: {
      politician: makePolitician(),
      councillors: [],
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

describe('v2 save migration', () => {
  it('migrates deputy-leader career rank to committee-chair', () => {
    const world = withPoliticianMode(makeWorld())
    world.politicianMode!.politician.careerTier = 'deputy-leader'
    world.politicianMode!.politician.careerRank = 'backbencher'

    const migrated = parseSaveData(JSON.stringify(baseV2Save(world)))
    expect(migrated?.world.politicianMode?.politician.careerRank).toBe('committee-chair')
    expect(migrated?.world.politicianMode?.politician.careerTier).toBe('committee-chair')
  })

  it('migrates mayor career rank to party-leader with victory state', () => {
    const world = withPoliticianMode(makeWorld({ week: 12, electionsHeld: 1 }))
    world.politicianMode!.politician.careerTier = 'mayor'
    world.politicianMode!.politician.careerRank = 'backbencher'

    const migrated = parseSaveData(JSON.stringify(baseV2Save(world)))
    expect(migrated?.world.politicianMode?.politician.careerRank).toBe('party-leader')
    expect(migrated?.world.victory).toMatchObject({
      mayorFirstAchievedWeek: 12,
      mayorFirstAchievedElection: 1,
      victoryScreenSeen: true,
    })
  })

  it('synchronizes party leader name after migration', () => {
    const world = withPoliticianMode(makeWorld())
    world.politicianMode!.politician.careerTier = 'party-leader'
    world.politicianMode!.politician.careerRank = 'backbencher'
    world.politicianMode!.politician.name = 'Jordan Lee'

    const migrated = parseSaveData(JSON.stringify(baseV2Save(world)))
    const party = migrated?.world.parties.find((entry) => entry.id === migrated.world.playerPartyId)
    expect(party?.leader).toBe('Jordan Lee')
  })

  it('infers government from old isGoverning fields', () => {
    const world = withPoliticianMode(makeWorld({
      playerPartyId: 'party-a',
      parties: [
        makeParty({ id: 'party-a' }),
        makeParty({ id: 'party-b', name: 'Partner', colour: '#111' }),
      ],
    })) as World & { isGoverning?: boolean; coalitionPartnerId?: string }
    world.isGoverning = true
    world.coalitionPartnerId = 'party-b'
    delete world.government

    const migrated = parseSaveData(JSON.stringify(baseV2Save(world)))
    expect(migrated?.world.government).toMatchObject({
      status: 'formed',
      kind: 'coalition',
      leadPartyId: 'party-a',
      partnerPartyIds: ['party-b'],
    })
  })

  it('converts old alliance pacts to ElectoralPact with commitments', () => {
    const world = withPoliticianMode(makeWorld({
      playerPartyId: 'party-a',
      parties: [
        makeParty({ id: 'party-a' }),
        makeParty({ id: 'party-b', name: 'Partner', colour: '#111' }),
      ],
      electoralPacts: [],
    }))
    const alliancePact: AlliancePact = {
      id: 'alliance-1',
      partyAId: 'party-a',
      partyBId: 'party-b',
      createdAtWeek: 3,
      expiresWeek: 20,
      entries: [{
        id: 'entry-1',
        wardA: 'ward-1',
        wardAName: 'Central Ward',
        wardB: 'ward-1',
        wardBName: 'Central Ward',
        isUnilateral: true,
        endorsementForB: 12,
        endorsementForA: 0,
      }],
    }
    world.alliancePacts = [alliancePact]

    const migrated = parseSaveData(JSON.stringify(baseV2Save(world)))
    expect(migrated?.world.electoralPacts).toHaveLength(1)
    expect(migrated?.world.electoralPacts[0]).toMatchObject({
      id: 'alliance-1',
      partyIds: ['party-a', 'party-b'],
      status: 'active',
    })
    expect(migrated?.world.electoralPacts[0].commitments).toHaveLength(1)
    expect(migrated?.world.electoralPacts[0].commitments[0]).toMatchObject({
      standingDownPartyId: 'party-a',
      wardId: 'ward-1',
      beneficiaryPartyId: 'party-b',
      endorsementShare: 12,
      status: 'active',
    })
  })

  it('creates activePolicies from old passed motions', () => {
    const world = withPoliticianMode(makeWorld())
    world.politicianMode!.legislationHistory = [
      makeMotion({ id: 'motion-passed', status: 'passed', kind: 'ordinary', category: 'services' }),
      makeMotion({ id: 'motion-failed', status: 'failed', kind: 'ordinary', category: 'transport' }),
    ]
    world.politicianMode!.activePolicies = []

    const migrated = parseSaveData(JSON.stringify(baseV2Save(world)))
    expect(migrated?.world.politicianMode?.activePolicies).toHaveLength(1)
    expect(migrated?.world.politicianMode?.activePolicies[0]).toMatchObject({
      id: 'policy_motion-passed',
      originatingMotionId: 'motion-passed',
      category: 'services',
    })
  })

  it('does not mutate the input object', () => {
    const world = withPoliticianMode(makeWorld())
    world.politicianMode!.politician.careerTier = 'deputy-leader'
    const save = baseV2Save(world)
    const before = JSON.stringify(save)

    parseSaveData(JSON.stringify(save))

    expect(JSON.stringify(save)).toBe(before)
  })
})

describe('v3 validation', () => {
  it('rejects invalid v3 data', () => {
    const world = withPoliticianMode(makeWorld())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(world.politicianMode!.politician as any).careerRank = 'mayor'

    const invalid = parseSaveData(JSON.stringify({
      version: 3,
      savedAt: '2026-01-01T00:00:00.000Z',
      constituencyCount: 1,
      world,
      previousNationalResults: null,
    }))
    expect(invalid).toBeNull()
  })
})
