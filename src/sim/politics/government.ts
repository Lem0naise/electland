import type { World, PartyDefinition } from '../../types/world'
import type { GovernmentState, GovernmentKind } from '../../types/politics'

export function isPartyInGovernment(world: World, partyId: string): boolean {
  const gov = world.government
  if (!gov || gov.status !== 'formed') return false
  return gov.leadPartyId === partyId || gov.partnerPartyIds.includes(partyId)
}

export function isPlayerPartyInGovernment(world: World): boolean {
  return isPartyInGovernment(world, world.playerPartyId)
}

export function isPlayerPartyGovernmentLead(world: World): boolean {
  const gov = world.government
  return gov?.status === 'formed' && gov.leadPartyId === world.playerPartyId
}

export function governmentLeadParty(world: World): PartyDefinition | undefined {
  const leadPartyId = world.government?.leadPartyId
  if (!leadPartyId) return undefined
  return world.parties.find((party) => party.id === leadPartyId)
}

export function createCaretakerGovernment(incumbentPartyId: string, week: number): GovernmentState {
  return {
    status: 'formed',
    kind: 'caretaker',
    leadPartyId: incumbentPartyId,
    partnerPartyIds: [],
    formedWeek: week,
    electionNumber: 0,
  }
}

function formedGovernment(
  world: World,
  kind: GovernmentKind,
  leadPartyId: string,
  partnerPartyIds: string[],
): GovernmentState {
  return {
    status: 'formed',
    kind,
    leadPartyId,
    partnerPartyIds,
    formedWeek: world.week,
    electionNumber: world.electionsHeld,
  }
}

function leadPartyName(world: World, partyId: string): string {
  return world.parties.find((party) => party.id === partyId)?.name ?? partyId
}

export function formMajorityGovernment(world: World, leadPartyId: string): World {
  const leadName = leadPartyName(world, leadPartyId)
  return {
    ...world,
    government: formedGovernment(world, 'majority', leadPartyId, []),
    newsFeed: [`Week ${world.week}: ${leadName} forms a majority administration.`, ...world.newsFeed].slice(0, 30),
  }
}

export function formMinorityGovernment(world: World, leadPartyId: string): World {
  const leadName = leadPartyName(world, leadPartyId)
  return {
    ...world,
    government: formedGovernment(world, 'minority', leadPartyId, []),
    newsFeed: [`Week ${world.week}: ${leadName} forms a minority administration.`, ...world.newsFeed].slice(0, 30),
  }
}

export function formCoalitionGovernment(world: World, leadPartyId: string, partnerIds: string[]): World {
  const leadName = leadPartyName(world, leadPartyId)
  const partnerNames = partnerIds.map((id) => leadPartyName(world, id)).join(', ')
  return {
    ...world,
    government: formedGovernment(world, 'coalition', leadPartyId, partnerIds),
    newsFeed: [`Week ${world.week}: ${leadName} forms a coalition with ${partnerNames}.`, ...world.newsFeed].slice(0, 30),
  }
}

export function beginGovernmentFormation(world: World): World {
  const largest = [...world.nationalResults].sort((a, b) => b.seatsWon - a.seatsWon)[0]
  const leadPartyId = largest?.partyId ?? world.playerPartyId
  const existing = world.government
  return {
    ...world,
    government: {
      status: 'forming',
      kind: existing?.kind ?? 'caretaker',
      leadPartyId: existing?.leadPartyId ?? leadPartyId,
      partnerPartyIds: existing?.partnerPartyIds ?? [],
      formedWeek: existing?.formedWeek ?? world.week,
      electionNumber: world.electionsHeld,
    },
  }
}

export function resolveGovernmentFormation(
  world: World,
  kind: GovernmentKind,
  leadPartyId: string,
  partnerIds: string[] = [],
): World {
  if (world.government?.status === 'formed' && world.government.kind === kind && world.government.leadPartyId === leadPartyId) {
    const existingPartners = world.government.partnerPartyIds
    if (
      existingPartners.length === partnerIds.length
      && existingPartners.every((id) => partnerIds.includes(id))
    ) {
      return world
    }
  }

  switch (kind) {
    case 'caretaker':
      return {
        ...world,
        government: {
          ...createCaretakerGovernment(leadPartyId, world.week),
          electionNumber: world.electionsHeld,
        },
      }
    case 'majority':
      return formMajorityGovernment(world, leadPartyId)
    case 'minority':
      return formMinorityGovernment(world, leadPartyId)
    case 'coalition':
      return formCoalitionGovernment(world, leadPartyId, partnerIds)
    default:
      return world
  }
}
