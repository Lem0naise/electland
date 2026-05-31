import type { World } from '../types/sim'

const SAVE_KEY = 'electland_save'

export interface SaveData {
  version: 1
  savedAt: string
  constituencyCount: number
  world: World
  previousWorld: World | null
}

function buildSaveData(world: World, previousWorld: World | null, constituencyCount: number): SaveData {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    constituencyCount,
    world,
    previousWorld,
  }
}

export function saveGame(world: World, previousWorld: World | null, constituencyCount: number): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveData(world, previousWorld, constituencyCount)))
  } catch {
    // localStorage full or unavailable
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return parseSaveData(raw)
  } catch {
    return null
  }
}

export function parseSaveData(raw: string): SaveData | null {
  try {
    const data = JSON.parse(raw) as SaveData
    if (data.version !== 1) return null
    if (!data.world || !data.world.seed) return null
    return data
  } catch {
    return null
  }
}

export function exportSaveGame(world: World, previousWorld: World | null, constituencyCount: number): void {
  const data = buildSaveData(world, previousWorld, constituencyCount)
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `electland-${data.world.townName.replace(/\s+/g, '-')}-wk${data.world.week}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function importSaveGame(): Promise<SaveData | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = () => {
        const data = parseSaveData(reader.result as string)
        resolve(data)
      }
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
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
