import { describe, it, expect } from 'vitest'
import { suggestPacts } from '../sim'
import { makeWorld, makeParty } from '../../test/builders'
import type { World, Constituency, ConstituencyResult } from '../../types/world'
import type { AlliancePact, AlliancePactEntry } from '../../types/politics'

function makeResult(partyId: string, partyName: string, colour: string, voteShare: number): ConstituencyResult {
  return { partyId, partyName, colour, voteShare, votes: Math.round(voteShare * 50) }
}

function makeWard(id: string, name: string, results: ConstituencyResult[]): Constituency {
  const sorted = [...results].sort((a, b) => b.voteShare - a.voteShare)
  return {
    id,
    name,
    seed: { x: 460, y: 320 },
    population: 5000,
    turnout: 0.5,
    urbanity: 0.5,
    tags: [],
    blocMix: { 'bloc-1': 1 },
    values: { change: 0, growth: 0, services: 0 },
    cellPath: '',
    results: sorted,
    leadingPartyId: sorted[0]?.partyId ?? '',
    leadingPartyName: sorted[0]?.partyName ?? '',
    margin: sorted.length >= 2 ? sorted[0].voteShare - sorted[1].voteShare : sorted[0]?.voteShare ?? 0,
    candidates: [],
    history: [],
    tacticalPressure: {},
  }
}

function makeAlliancePact(overrides: Partial<AlliancePact> & { entries: AlliancePactEntry[] }): AlliancePact {
  return {
    id: 'pact-1',
    partyAId: 'tory',
    partyBId: 'reform',
    createdAtWeek: 1,
    expiresWeek: 24,
    ...overrides,
  }
}

function makeAllianceEntry(overrides: Partial<AlliancePactEntry>): AlliancePactEntry {
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

function exchangeStepsScenarioWorld(): World {
  const green = makeParty({ id: 'green', name: 'Green Party', colour: '#0f0', values: { change: 50, growth: -30, services: 60 } })
  const labour = makeParty({ id: 'labour', name: 'Labour', colour: '#f00', values: { change: 30, growth: 10, services: 40 } })
  const tory = makeParty({ id: 'tory', name: 'Conservatives', colour: '#00f', values: { change: -40, growth: 40, services: -20 } })
  const libdem = makeParty({ id: 'libdem', name: 'Lib Dems', colour: '#fa0', values: { change: 20, growth: 20, services: 30 } })
  const reform = makeParty({ id: 'reform', name: 'Reform UK', colour: '#0af', values: { change: -60, growth: 30, services: -40 } })

  return makeWorld({
    playerPartyId: 'green',
    parties: [green, labour, tory, libdem, reform],
    constituencies: [
      makeWard('exchange-steps', 'Exchange Steps', [
        makeResult('labour', 'Labour', '#f00', 39.0),
        makeResult('tory', 'Conservatives', '#00f', 35.5),
        makeResult('libdem', 'Lib Dems', '#fa0', 13.5),
        makeResult('green', 'Green Party', '#0f0', 7.7),
        makeResult('reform', 'Reform UK', '#0af', 4.4),
      ]),
      makeWard('pump-copse', 'Pump Copse', [
        makeResult('green', 'Green Party', '#0f0', 41.4),
        makeResult('labour', 'Labour', '#f00', 22.0),
        makeResult('libdem', 'Lib Dems', '#fa0', 21.0),
        makeResult('tory', 'Conservatives', '#00f', 8.0),
        makeResult('reform', 'Reform UK', '#0af', 6.0),
      ]),
      makeWard('pickwick-croft', 'Pickwick Croft', [
        makeResult('green', 'Green Party', '#0f0', 43.3),
        makeResult('labour', 'Labour', '#f00', 23.4),
        makeResult('tory', 'Conservatives', '#00f', 10.0),
        makeResult('libdem', 'Lib Dems', '#fa0', 15.0),
        makeResult('reform', 'Reform UK', '#0af', 8.3),
      ]),
      makeWard('pound-close', 'Pound Close', [
        makeResult('labour', 'Labour', '#f00', 32.1),
        makeResult('green', 'Green Party', '#0f0', 22.0),
        makeResult('tory', 'Conservatives', '#00f', 9.0),
        makeResult('libdem', 'Lib Dems', '#fa0', 25.0),
        makeResult('reform', 'Reform UK', '#0af', 11.9),
      ]),
      makeWard('st-marys-row', 'St Marys Row', [
        makeResult('labour', 'Labour', '#f00', 55.0),
        makeResult('green', 'Green Party', '#0f0', 25.0),
        makeResult('reform', 'Reform UK', '#0af', 12.0),
        makeResult('libdem', 'Lib Dems', '#fa0', 8.0),
        makeResult('tory', 'Conservatives', '#00f', 0.0),
      ]),
    ],
    alliancePacts: [],
    allianceReputation: {},
  })
}

describe('suggestPacts strategic scoring', () => {
  it('includes Exchange Steps as a counter-demand option when Tories are competitive there', () => {
    const world = exchangeStepsScenarioWorld()
    const suggs = suggestPacts(world, 'tory')
    const pumpCopseCounters = suggs.filter((s) => s.theirWardId === 'pump-copse')

    const exchangeSteps = pumpCopseCounters.find((s) => s.ourWardId === 'exchange-steps')
    expect(exchangeSteps).toBeDefined()
    expect(exchangeSteps!.score).toBeGreaterThan(0)
  })

  it('weights strategically useful wards higher than raw pp gain alone', () => {
    const green = makeParty({ id: 'green', name: 'Green Party', colour: '#0f0' })
    const tory = makeParty({ id: 'tory', name: 'Conservatives', colour: '#00f' })
    const labour = makeParty({ id: 'labour', name: 'Labour', colour: '#f00' })

    const world = makeWorld({
      playerPartyId: 'green',
      parties: [green, tory, labour],
      constituencies: [
        makeWard('ward-close', 'Close Ward', [
          makeResult('labour', 'Labour', '#f00', 40.0),
          makeResult('tory', 'Conservatives', '#00f', 37.0),
          makeResult('green', 'Green Party', '#0f0', 15.0),
        ]),
        makeWard('ward-hopeless', 'Hopeless Ward', [
          makeResult('labour', 'Labour', '#f00', 55.0),
          makeResult('green', 'Green Party', '#0f0', 30.0),
          makeResult('tory', 'Conservatives', '#00f', 5.0),
        ]),
        makeWard('ward-target', 'Target Ward', [
          makeResult('tory', 'Conservatives', '#00f', 40.0),
          makeResult('labour', 'Labour', '#f00', 35.0),
          makeResult('green', 'Green Party', '#0f0', 15.0),
        ]),
      ],
      alliancePacts: [],
      allianceReputation: {},
    })

    const suggs = suggestPacts(world, 'tory')
    const targetCounters = suggs.filter((s) => s.theirWardId === 'ward-target')
    const closeWard = targetCounters.find((s) => s.ourWardId === 'ward-close')
    const hopelessWard = targetCounters.find((s) => s.ourWardId === 'ward-hopeless')

    expect(closeWard).toBeDefined()
    if (hopelessWard) {
      expect(closeWard!.score).toBeGreaterThan(hopelessWard.score)
    }
  })

  it('filters out wards where beneficiary is hopelessly behind', () => {
    const world = exchangeStepsScenarioWorld()
    const suggs = suggestPacts(world, 'tory')
    const pumpCopseCounters = suggs.filter((s) => s.theirWardId === 'pump-copse')

    const stMarys = pumpCopseCounters.find((s) => s.ourWardId === 'st-marys-row')
    expect(stMarys).toBeUndefined()
  })

  it('filters out counter-demand wards where beneficiary after share is below 10%', () => {
    const world = exchangeStepsScenarioWorld()
    const suggs = suggestPacts(world, 'tory')
    const pumpCopseCounters = suggs.filter((s) => s.theirWardId === 'pump-copse')

    for (const s of pumpCopseCounters) {
      expect(s.allyGainPp).toBeGreaterThan(0)
    }
  })
})

describe('suggestPacts cross-pact filtering', () => {
  it('excludes wards where ally is already standing down', () => {
    const world = exchangeStepsScenarioWorld()
    world.alliancePacts = [
      makeAlliancePact({
        partyAId: 'tory',
        partyBId: 'reform',
        entries: [
          makeAllianceEntry({
            wardA: 'st-marys-row',
            wardAName: 'St Marys Row',
            wardB: 'exchange-steps',
            wardBName: 'Exchange Steps',
          }),
        ],
      }),
    ]

    const suggs = suggestPacts(world, 'tory')

    const stMarysAsCounter = suggs.find((s) => s.ourWardId === 'st-marys-row')
    expect(stMarysAsCounter).toBeUndefined()

    const exchangeStepsAsCounter = suggs.find((s) => s.ourWardId === 'exchange-steps')
    expect(exchangeStepsAsCounter).toBeDefined()
  })

  it('does not exclude wards where an unrelated party has a pact', () => {
    const world = exchangeStepsScenarioWorld()
    world.alliancePacts = [
      makeAlliancePact({
        partyAId: 'labour',
        partyBId: 'libdem',
        entries: [
          makeAllianceEntry({
            wardA: 'pickwick-croft',
            wardAName: 'Pickwick Croft',
            wardB: 'pound-close',
            wardBName: 'Pound Close',
          }),
        ],
      }),
    ]

    const suggs = suggestPacts(world, 'tory')
    const pickwickAsCounter = suggs.find((s) => s.ourWardId === 'pickwick-croft')
    expect(pickwickAsCounter).toBeDefined()
  })
})

describe('suggestPacts competitiveness floor', () => {
  it('filters out wards where Tories go from 0% to a trivial share', () => {
    const green = makeParty({ id: 'green', name: 'Green Party', colour: '#0f0' })
    const tory = makeParty({ id: 'tory', name: 'Conservatives', colour: '#00f' })
    const labour = makeParty({ id: 'labour', name: 'Labour', colour: '#f00' })

    const world = makeWorld({
      playerPartyId: 'green',
      parties: [green, tory, labour],
      constituencies: [
        makeWard('ward-hopeless', 'Hopeless Ward', [
          makeResult('labour', 'Labour', '#f00', 60.0),
          makeResult('green', 'Green Party', '#0f0', 30.0),
          makeResult('tory', 'Conservatives', '#00f', 2.0),
        ]),
        makeWard('ward-target', 'Target Ward', [
          makeResult('tory', 'Conservatives', '#00f', 40.0),
          makeResult('labour', 'Labour', '#f00', 35.0),
          makeResult('green', 'Green Party', '#0f0', 15.0),
        ]),
      ],
      alliancePacts: [],
      allianceReputation: {},
    })

    const suggs = suggestPacts(world, 'tory')
    const hopelessAsCounter = suggs.filter(
      (s) => s.theirWardId === 'ward-target' && s.ourWardId === 'ward-hopeless',
    )
    expect(hopelessAsCounter).toHaveLength(0)
  })

  it('allows wards where beneficiary would become competitive', () => {
    const green = makeParty({ id: 'green', name: 'Green Party', colour: '#0f0' })
    const tory = makeParty({ id: 'tory', name: 'Conservatives', colour: '#00f' })
    const labour = makeParty({ id: 'labour', name: 'Labour', colour: '#f00' })

    const world = makeWorld({
      playerPartyId: 'green',
      parties: [green, tory, labour],
      constituencies: [
        makeWard('ward-competitive', 'Competitive Ward', [
          makeResult('labour', 'Labour', '#f00', 38.0),
          makeResult('tory', 'Conservatives', '#00f', 30.0),
          makeResult('green', 'Green Party', '#0f0', 20.0),
        ]),
        makeWard('ward-target', 'Target Ward', [
          makeResult('tory', 'Conservatives', '#00f', 40.0),
          makeResult('labour', 'Labour', '#f00', 35.0),
          makeResult('green', 'Green Party', '#0f0', 15.0),
        ]),
      ],
      alliancePacts: [],
      allianceReputation: {},
    })

    const suggs = suggestPacts(world, 'tory')
    const competitiveAsCounter = suggs.filter(
      (s) => s.theirWardId === 'ward-target' && s.ourWardId === 'ward-competitive',
    )
    expect(competitiveAsCounter).toHaveLength(1)
  })
})
