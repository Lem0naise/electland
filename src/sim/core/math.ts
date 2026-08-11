import type { PoliticalValues } from '../../types/world'

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function softmax(scores: number[], temperature: number): number[] {
  const max = Math.max(...scores)
  const values = scores.map((score) => Math.exp((score - max) / temperature))
  const total = values.reduce((sum, value) => sum + value, 0)
  return values.map((value) => value / total)
}

export function roundPoliticalValues(v: PoliticalValues): PoliticalValues {
  return {
    change: Math.round(v.change),
    growth: Math.round(v.growth),
    services: Math.round(v.services),
  }
}
