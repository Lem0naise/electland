import { describe, it, expect } from 'vitest'
import { formatElectionNightReport } from '../formatElectionNightReport'
import { makeParty, makeWorld } from '../../test/builders'
import type { ElectionNightResult } from '../../types/elections'
import type { AlliancePact, AlliancePactEntry } from '../../types/politics'
import type { ConstituencyResult } from '../../types/world'

function makeRow(partyId: string, partyName: string, voteShare: number, votes: number): ConstituencyResult {
  return { partyId, partyName, colour: '#000', voteShare, votes }
}

function makeNightResult(overrides: Partial<ElectionNightResult> & Pick<ElectionNightResult, 'wardId' | 'wardName'>): ElectionNightResult {
  const winnerPartyId = overrides.winner?.partyId ?? 'libs'
  const winnerPartyName = overrides.winner?.partyName ?? 'Liberals'
  const winnerName = overrides.winner?.name ?? 'Jane Smith'
  return {
    winner: {
      partyId: winnerPartyId,
      partyName: winnerPartyName,
      partyColour: '#fa0',
      name: winnerName,
      initials: 'JS',
    },
    results: [
      makeRow(winnerPartyId, winnerPartyName, 48.2, 1412),
      makeRow('cons', 'Conservatives', 31.1, 911),
    ],
    candidates: [
      { partyId: winnerPartyId, name: winnerName, colour: '#fa0' },
      { partyId: 'cons', name: 'John Doe', colour: '#00f' },
    ],
    turnout: 0.612,
    wasHeld: false,
    ...overrides,
  }
}

function makePact(overrides: Partial<AlliancePact> & { entries: AlliancePactEntry[] }): AlliancePact {
  return {
    id: 'pact-1',
    partyAId: 'ratepayers',
    partyBId: 'libs',
    createdAtWeek: 1,
    expiresWeek: 24,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<AlliancePactEntry>): AlliancePactEntry {
  return {
    id: 'entry-1',
    wardA: '',
    wardAName: '',
    wardB: '',
    wardBName: '',
    isUnilateral: false,
    endorsementForA: 0,
    endorsementForB: 0,
    ...overrides,
  }
}

const liberals = makeParty({ id: 'libs', name: 'Liberals', colour: '#fa0', leader: 'Jane Smith' })
const conservatives = makeParty({ id: 'cons', name: 'Conservatives', colour: '#00f', leader: 'John Doe' })
const ratepayers = makeParty({ id: 'ratepayers', name: 'Ratepayers Alliance', colour: '#888', leader: 'Ann Lee' })
const inkfleeters = makeParty({ id: 'ink', name: 'Inkfleeters', colour: '#333', leader: 'Ivy Ink' })

describe('formatElectionNightReport', () => {
  it('prints winner swing and omits unlabeled margin', () => {
    const world = makeWorld({
      townName: 'Rivertown',
      week: 52,
      playerPartyId: 'libs',
      parties: [liberals, conservatives],
      electionsHeld: 2,
      stats: {
        ...makeWorld().stats,
        councilMajority: 1,
        averageTurnout: 0.612,
      },
      electionNightResults: [
        makeNightResult({
          wardId: 'dukes-way',
          wardName: "Duke's Way",
          swingFromLastElection: 3.4,
        }),
      ],
    })

    const text = formatElectionNightReport(world)

    expect(text).toContain("Duke's Way")
    expect(text).toContain('Winner: Liberals — Jane Smith, 48.2% (1,412 votes)')
    expect(text).toContain('Winner swing vs last election: +3.4pp')
    expect(text).not.toMatch(/\(\+\d+\.\d+pts\)/)
  })

  it('omits the swing line on a first election', () => {
    const world = makeWorld({
      playerPartyId: 'libs',
      parties: [liberals, conservatives],
      electionsHeld: 1,
      electionNightResults: [
        makeNightResult({
          wardId: 'dukes-way',
          wardName: "Duke's Way",
        }),
      ],
    })

    const text = formatElectionNightReport(world)

    expect(text).not.toContain('Winner swing vs last election')
  })

  it('lists player–NPC and NPC–NPC stand-downs on the relevant wards', () => {
    const world = makeWorld({
      playerPartyId: 'libs',
      parties: [liberals, conservatives, ratepayers, inkfleeters],
      electionsHeld: 1,
      electionNightResults: [
        makeNightResult({
          wardId: 'reed-pool',
          wardName: 'Reed Pool',
          winner: {
            partyId: 'libs',
            partyName: 'Liberals',
            partyColour: '#fa0',
            name: 'Jane Smith',
            initials: 'JS',
          },
        }),
        makeNightResult({
          wardId: 'willow-side',
          wardName: 'Willow Side',
          winner: {
            partyId: 'cons',
            partyName: 'Conservatives',
            partyColour: '#00f',
            name: 'John Doe',
            initials: 'JD',
          },
          results: [
            makeRow('cons', 'Conservatives', 44.0, 1200),
            makeRow('libs', 'Liberals', 30.0, 820),
          ],
          candidates: [
            { partyId: 'cons', name: 'John Doe', colour: '#00f' },
            { partyId: 'libs', name: 'Jane Smith', colour: '#fa0' },
          ],
        }),
      ],
      alliancePacts: [
        makePact({
          id: 'player-npc',
          partyAId: 'ratepayers',
          partyBId: 'libs',
          entries: [
            makeEntry({
              wardA: 'reed-pool',
              wardAName: 'Reed Pool',
              wardB: 'cathedral',
              wardBName: 'Cathedral Precinct',
            }),
          ],
        }),
        makePact({
          id: 'npc-npc',
          partyAId: 'ink',
          partyBId: 'cons',
          entries: [
            makeEntry({
              id: 'entry-2',
              wardA: 'willow-side',
              wardAName: 'Willow Side',
              wardB: 'lily-beck',
              wardBName: 'Lily Beck',
            }),
          ],
        }),
      ],
    })

    const text = formatElectionNightReport(world)
    const reedBlock = text.slice(text.indexOf('Reed Pool'), text.indexOf('Willow Side'))
    const willowBlock = text.slice(text.indexOf('Willow Side'), text.indexOf('COUNCIL SEATS'))

    expect(reedBlock).toContain('Stand-down: Ratepayers Alliance standing down here for Liberals')
    expect(willowBlock).toContain('Stand-down: Inkfleeters standing down here for Conservatives')
    expect(reedBlock).not.toContain('Inkfleeters')
    expect(willowBlock).not.toContain('Ratepayers Alliance')
  })

  it('omits broken pacts', () => {
    const world = makeWorld({
      playerPartyId: 'libs',
      parties: [liberals, ratepayers],
      electionsHeld: 1,
      electionNightResults: [
        makeNightResult({
          wardId: 'reed-pool',
          wardName: 'Reed Pool',
        }),
      ],
      alliancePacts: [
        makePact({
          broken: true,
          entries: [
            makeEntry({
              wardA: 'reed-pool',
              wardAName: 'Reed Pool',
              wardB: 'cathedral',
              wardBName: 'Cathedral Precinct',
            }),
          ],
        }),
      ],
    })

    const text = formatElectionNightReport(world)

    expect(text).not.toContain('Stand-down:')
  })
})
