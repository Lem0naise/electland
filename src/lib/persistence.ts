import type { World } from '../types/sim'

const SAVE_KEY = 'electland_save'

interface SaveData {
  version: 1
  savedAt: string
  constituencyCount: number
  world: World
  previousWorld: World | null
}

export function saveGame(world: World, previousWorld: World | null, constituencyCount: number): void {
  const data: SaveData = {
    version: 1,
    savedAt: new Date().toISOString(),
    constituencyCount,
    world,
    previousWorld,
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SaveData
    if (data.version !== 1) return null
    return data
  } catch {
    return null
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null
  } catch {
    return false
  }
}
