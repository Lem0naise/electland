import { clamp } from '../core/math'
import type { World } from '../../types/world'
import type { Relationship } from '../../types/politics'

export function getRelationshipLabel(strength: number): 'ally' | 'rival' | 'neutral' {
  if (strength > 40) return 'ally'
  if (strength < -30) return 'rival'
  return 'neutral'
}

export function updateRelationship(world: World, targetId: string, delta: number, reason: string): World {
  const pm = world.politicianMode
  if (!pm) return world

  const existing = pm.politician.relationships.find((entry) => entry.targetId === targetId)
  if (!existing) return world

  const strength = clamp(existing.strength + delta, -100, 100)
  const type: Relationship['type'] =
    strength > 40 ? 'ally'
    : strength < -30 ? 'rival'
    : existing.type === 'mentor' ? 'mentor'
    : 'neutral'

  const relationships = pm.politician.relationships.map((entry) => {
    if (entry.targetId !== targetId) return entry
    return {
      ...entry,
      strength,
      type,
      history: [...entry.history, reason].slice(-8),
    }
  })

  return {
    ...world,
    politicianMode: {
      ...pm,
      politician: {
        ...pm.politician,
        relationships,
      },
    },
  }
}
