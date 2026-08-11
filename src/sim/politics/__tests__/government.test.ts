import { describe, it, expect } from 'vitest'
import {
  createCaretakerGovernment,
  formMajorityGovernment,
  formCoalitionGovernment,
  isPartyInGovernment,
  isPlayerPartyGovernmentLead,
  beginGovernmentFormation,
  resolveGovernmentFormation,
} from '../government'
import { makeWorld, makeParty, makeGovernment } from '../../../test/builders'

describe('createCaretakerGovernment', () => {
  it('produces valid caretaker state', () => {
    const gov = createCaretakerGovernment('party-a', 3)
    expect(gov.status).toBe('formed')
    expect(gov.kind).toBe('caretaker')
    expect(gov.leadPartyId).toBe('party-a')
    expect(gov.partnerPartyIds).toEqual([])
    expect(gov.formedWeek).toBe(3)
  })
})

describe('formMajorityGovernment', () => {
  it('sets correct kind and lead', () => {
    const world = formMajorityGovernment(makeWorld(), 'party-a')
    expect(world.government?.status).toBe('formed')
    expect(world.government?.kind).toBe('majority')
    expect(world.government?.leadPartyId).toBe('party-a')
    expect(world.government?.partnerPartyIds).toEqual([])
  })
})

describe('formCoalitionGovernment', () => {
  it('records partner IDs', () => {
    const world = makeWorld({
      parties: [
        makeParty({ id: 'party-a' }),
        makeParty({ id: 'party-b', name: 'Alliance Partner', colour: '#111' }),
      ],
    })
    const next = formCoalitionGovernment(world, 'party-a', ['party-b'])
    expect(next.government?.kind).toBe('coalition')
    expect(next.government?.leadPartyId).toBe('party-a')
    expect(next.government?.partnerPartyIds).toEqual(['party-b'])
  })
})

describe('isPartyInGovernment', () => {
  it('works for lead and partners', () => {
    const world = makeWorld({
      parties: [
        makeParty({ id: 'party-a' }),
        makeParty({ id: 'party-b', name: 'Partner', colour: '#111' }),
        makeParty({ id: 'party-c', name: 'Opposition', colour: '#222' }),
      ],
      government: makeGovernment({
        leadPartyId: 'party-a',
        partnerPartyIds: ['party-b'],
        kind: 'coalition',
      }),
    })
    expect(isPartyInGovernment(world, 'party-a')).toBe(true)
    expect(isPartyInGovernment(world, 'party-b')).toBe(true)
    expect(isPartyInGovernment(world, 'party-c')).toBe(false)
  })
})

describe('isPlayerPartyGovernmentLead', () => {
  it('returns false for junior partner', () => {
    const world = makeWorld({
      playerPartyId: 'party-a',
      parties: [
        makeParty({ id: 'party-a' }),
        makeParty({ id: 'party-b', name: 'Lead Party', colour: '#111' }),
      ],
      government: makeGovernment({
        leadPartyId: 'party-b',
        partnerPartyIds: ['party-a'],
        kind: 'coalition',
      }),
    })
    expect(isPlayerPartyGovernmentLead(world)).toBe(false)
  })
})

describe('beginGovernmentFormation', () => {
  it('sets status to forming', () => {
    const world = makeWorld({
      nationalResults: [
        { partyId: 'party-a', partyName: 'Progressive Alliance', leader: 'Alex Morgan', colour: '#2d5a27', seatsWon: 5, voteShare: 40, votes: 5000 },
      ],
    })
    const next = beginGovernmentFormation(world)
    expect(next.government?.status).toBe('forming')
  })
})

describe('resolveGovernmentFormation', () => {
  it('is idempotent when already formed with same configuration', () => {
    const formed = formMajorityGovernment(makeWorld(), 'party-a')
    const again = resolveGovernmentFormation(formed, 'majority', 'party-a', [])
    expect(again).toBe(formed)
  })
})
