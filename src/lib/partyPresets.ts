import type { PartyArchetype, PartyEdit, PartyFooting, PoliticalValues, World } from '../types/sim'

export type PartyPresetEntry = {
  name: string
  colour: string
  values: PoliticalValues
  slogan?: string
  preferredArchetype?: PartyArchetype
  preferredFooting?: PartyFooting
}

export type PartyPresetPack = {
  id: string
  label: string
  parties: PartyPresetEntry[]
}

export const PARTY_PRESET_PACKS: PartyPresetPack[] = [
  {
    id: 'british-local',
    label: 'British local',
    parties: [
      { name: 'Local Conservatives', colour: '#0087DC', values: { change: -30, growth: 15, services: 25 }, preferredFooting: 'established', preferredArchetype: 'business' },
      { name: 'Labour', colour: '#E4003B', values: { change: 15, growth: 5, services: 35 }, preferredFooting: 'established', preferredArchetype: 'workers' },
      { name: 'Lib Dems', colour: '#FAA61A', values: { change: 10, growth: 15, services: 20 }, preferredArchetype: 'municipal' },
      { name: 'Green Party', colour: '#02A95B', values: { change: 40, growth: -35, services: 30 }, preferredArchetype: 'green' },
      { name: 'Reform UK', colour: '#70147A', values: { change: -35, growth: 15, services: 15 }, preferredArchetype: 'independence' },
    ],
  },
  {
    id: 'union-independence',
    label: 'Union vs independence',
    parties: [
      { name: 'Union Party', colour: '#003366', values: { change: -25, growth: 10, services: 20 }, preferredFooting: 'established', preferredArchetype: 'municipal' },
      { name: 'Independence Movement', colour: '#00843D', values: { change: 30, growth: -5, services: 15 }, preferredFooting: 'established', preferredArchetype: 'independence' },
      { name: 'Alliance', colour: '#F6B800', values: { change: 5, growth: 10, services: 20 }, preferredArchetype: 'municipal' },
      { name: 'Independents', colour: '#6B5335', values: { change: -5, growth: 0, services: 10 }, preferredArchetype: 'ratepayers' },
      { name: 'Green Voice', colour: '#2E8B57', values: { change: 35, growth: -25, services: 25 }, preferredArchetype: 'green' },
    ],
  },
  {
    id: 'progress-tradition',
    label: 'Progress vs tradition',
    parties: [
      { name: 'Progressives', colour: '#C41E3A', values: { change: 25, growth: 5, services: 35 }, preferredFooting: 'established', preferredArchetype: 'workers' },
      { name: 'Civic Tradition', colour: '#1B4F72', values: { change: -20, growth: 10, services: 15 }, preferredFooting: 'established', preferredArchetype: 'business' },
      { name: 'Municipal League', colour: '#5D6D7E', values: { change: 0, growth: 5, services: 15 }, preferredArchetype: 'municipal' },
      { name: 'Ratepayers', colour: '#8B5E3C', values: { change: -10, growth: 5, services: 5 }, preferredArchetype: 'ratepayers' },
      { name: 'Community First', colour: '#1F8A7A', values: { change: 15, growth: -10, services: 25 }, preferredArchetype: 'faith_community' },
    ],
  },
]

function sortPartiesForPreset(parties: World['parties']): World['parties'] {
  return [...parties].sort((a, b) => {
    const footingRank = (footing: PartyFooting) => (
      footing === 'established' ? 0 : footing === 'challenger' ? 1 : 2
    )
    const footingDiff = footingRank(a.footing) - footingRank(b.footing)
    if (footingDiff !== 0) return footingDiff
    return a.id.localeCompare(b.id)
  })
}

/** Map a preset pack onto draft party edits (names, colours, ideologies). */
export function applyPartyPresetPack(
  parties: World['parties'],
  edits: Record<string, PartyEdit>,
  packId: string,
): Record<string, PartyEdit> {
  const pack = PARTY_PRESET_PACKS.find((entry) => entry.id === packId)
  if (!pack) return edits

  const ordered = sortPartiesForPreset(parties)
  const remaining = [...pack.parties]
  const assignment = new Map<string, PartyPresetEntry>()

  // Prefer archetype / footing matches first
  for (const party of ordered) {
    const matchIndex = remaining.findIndex((preset) => (
      (preset.preferredFooting == null || preset.preferredFooting === party.footing)
      && (preset.preferredArchetype == null || preset.preferredArchetype === party.archetype)
    ))
    if (matchIndex >= 0) {
      assignment.set(party.id, remaining[matchIndex])
      remaining.splice(matchIndex, 1)
    }
  }

  // Fill leftover slots in footing order
  for (const party of ordered) {
    if (assignment.has(party.id) || remaining.length === 0) continue
    assignment.set(party.id, remaining.shift()!)
  }

  return Object.fromEntries(parties.map((party) => {
    const current = edits[party.id] ?? {
      id: party.id,
      name: party.name,
      leader: party.leader,
      colour: party.colour,
      values: { ...party.values },
    }
    const preset = assignment.get(party.id)
    if (!preset) return [party.id, current]
    return [party.id, {
      ...current,
      name: preset.name,
      colour: preset.colour,
      values: {
        change: Math.round(preset.values.change),
        growth: Math.round(preset.values.growth),
        services: Math.round(preset.values.services),
      },
    }]
  }))
}
