import { getDefaultBudget, initializePoliticianMode, normalizeBudget, normalizePartyIdentity, roundPoliticalValues } from './sim'
import type { PartyPerformance, World } from '../types/sim'

const SAVE_KEY = 'electland_save'
const CURRENT_VERSION = 2

export interface SaveData {
  version: number
  savedAt: string
  constituencyCount: number
  world: World
  previousNationalResults: PartyPerformance[] | null
}

export interface SaveResult {
  ok: boolean
  error?: string
}

function normalizeSave(data: SaveData): SaveData {
  const w = data.world
  if (w.gameMode !== 'single-politician') w.gameMode = 'single-politician'
  if (!w.politicianMode) w.politicianMode = initializePoliticianMode(w)
  if (w.politicianMode) {
    if (!w.politicianMode.autoCampaigns) w.politicianMode.autoCampaigns = []
    if (!w.politicianMode.legislationHistory) w.politicianMode.legislationHistory = []
    if (typeof w.politicianMode.politician.wardId !== 'string') w.politicianMode.politician.wardId = ''
    if (typeof w.politicianMode.councilSessionInterval !== 'number' || w.politicianMode.councilSessionInterval < 8) {
      w.politicianMode.councilSessionInterval = 8
    }
    if (typeof w.politicianMode.nextBudgetWeek !== 'number') {
      w.politicianMode.nextBudgetWeek = w.week + w.electionCycleWeeks
    }
    if (!Array.isArray(w.politicianMode.budgetHistory)) w.politicianMode.budgetHistory = []
    w.politicianMode.legislationHistory = w.politicianMode.legislationHistory.map((motion) => ({
      ...motion,
      kind: motion.kind ?? (motion.category === 'budget' ? 'budget' : 'ordinary'),
      costSignal: typeof motion.costSignal === 'number' ? motion.costSignal : 0.4,
      contestedness: motion.contestedness ?? 'contested',
      status: motion.status === 'repealed' ? 'repealed' : motion.status,
    }))
    const party = w.parties.find((entry) => entry.id === w.politicianMode!.politician.partyId)
    if (!w.politicianMode.politician.personalValues) {
      w.politicianMode.politician.personalValues = party ? roundPoliticalValues(party.values) : { change: 0, growth: 0, services: 0 }
    } else {
      w.politicianMode.politician.personalValues = {
        change: Math.round(w.politicianMode.politician.personalValues.change),
        growth: Math.round(w.politicianMode.politician.personalValues.growth),
        services: Math.round(w.politicianMode.politician.personalValues.services),
      }
    }
    if (typeof w.politicianMode.politician.personalPolicyNextWeek !== 'number') {
      w.politicianMode.politician.personalPolicyNextWeek = w.week
    }
  }
  if (!w.alliancePacts) w.alliancePacts = []
  if (!w.councilHistory) w.councilHistory = []
  if (!w.budget) w.budget = getDefaultBudget()
  else w.budget = normalizeBudget(w.budget)
  if (w.politicianMode?.proposedBudget) {
    w.politicianMode.proposedBudget = normalizeBudget(w.politicianMode.proposedBudget)
  }
  if (!w.allianceReputation) w.allianceReputation = {}
  w.constituencies = w.constituencies.map((constituency) => ({
    ...constituency,
    tacticalPressure: Object.fromEntries(w.parties.map((party) => [
      party.id,
      constituency.tacticalPressure?.[party.id] ?? 1,
    ])),
  }))
  if (!w.voteHistory) w.voteHistory = []
  if (!w.newsFeed) w.newsFeed = []
  if (!w.activeCampaigns) w.activeCampaigns = []
  if (!w.actionsThisWeek) w.actionsThisWeek = []
  if (!w.electionNightResults) w.electionNightResults = []
  if (!w.electionNightPreviousSeats) w.electionNightPreviousSeats = {}
  if (w.electionsHeld == null) w.electionsHeld = 0
  if (!w.governanceDecisions) w.governanceDecisions = []
  w.parties = w.parties.map((party) => normalizePartyIdentity(party))
  return data
}

function migrateSave(data: Record<string, unknown>): SaveData | null {
  const version = (data.version as number) ?? 1

  if (version === 1) {
    const prev = data.previousWorld as World | null
    const migrated: SaveData = {
      version: CURRENT_VERSION,
      savedAt: (data.savedAt as string) ?? new Date().toISOString(),
      constituencyCount: (data.constituencyCount as number) ?? 7,
      world: data.world as World,
      previousNationalResults: prev?.nationalResults ?? null,
    }
    return normalizeSave(migrated)
  }

  if (version === CURRENT_VERSION) {
    return normalizeSave(data as unknown as SaveData)
  }

  return null
}

function validateWorld(w: unknown): w is World {
  if (!w || typeof w !== 'object') return false
  const world = w as Record<string, unknown>
  return (
    typeof world.seed === 'number' &&
    typeof world.week === 'number' &&
    typeof world.townName === 'string' &&
    Array.isArray(world.parties) &&
    Array.isArray(world.constituencies) &&
    Array.isArray(world.tiles) &&
    typeof world.playerPartyId === 'string'
  )
}

export function saveGame(world: World, previousNationalResults: PartyPerformance[] | null, constituencyCount: number): SaveResult {
  try {
    const data: SaveData = {
      version: CURRENT_VERSION,
      savedAt: new Date().toISOString(),
      constituencyCount,
      world,
      previousNationalResults,
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save' }
  }
}

export function loadGame(): { data: SaveData; error?: never } | { data?: never; error: string } {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return { error: 'No save found' }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { error: 'Corrupt save data' }
    if (!validateWorld(parsed.world)) return { error: 'Invalid world data in save' }
    const migrated = migrateSave(parsed)
    if (!migrated) return { error: `Unsupported save version: ${parsed.version}` }
    return { data: migrated }
  } catch {
    return { error: 'Failed to read save' }
  }
}

export function parseSaveData(raw: string): SaveData | null {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!validateWorld(parsed.world)) return null
    return migrateSave(parsed)
  } catch {
    return null
  }
}

export function exportSaveGame(world: World, previousNationalResults: PartyPerformance[] | null, constituencyCount: number): void {
  const data: SaveData = {
    version: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    constituencyCount,
    world,
    previousNationalResults,
  }
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
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return validateWorld(parsed?.world)
  } catch {
    return false
  }
}
