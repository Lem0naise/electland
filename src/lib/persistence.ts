import { getDefaultBudget, initializePoliticianMode, normalizeBudget, normalizePartyIdentity, roundPoliticalValues } from './sim'
import type { PartyPerformance, World } from '../types/world'
import type {
  AlliancePact,
  CareerRank,
  ElectoralPact,
  GovernmentKind,
  GovernmentState,
  PactCommitment,
} from '../types/politics'
import type { BudgetEvent, EnactedPolicy, PoliticianModeState, PolicyEffect } from '../types/council'

const SAVE_KEY = 'electland_save'
const CURRENT_VERSION = 3

const VALID_CAREER_RANKS = new Set<CareerRank>(['backbencher', 'party-whip', 'party-leader'])

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

interface LegacyWorldFields {
  isGoverning?: boolean
  needsCoalition?: boolean
  coalitionPartnerId?: string
  minorityGovernment?: boolean
  currentMayorParty?: string
  currentMayorLeader?: string
}

type MigratableWorld = World & LegacyWorldFields

function largestPartyId(world: World): string | undefined {
  const sorted = [...world.nationalResults].sort((a, b) => b.seatsWon - a.seatsWon)
  return sorted[0]?.partyId ?? world.parties[0]?.id
}

function policyEffectsFromBlocImpact(blocImpact: Record<string, number>): PolicyEffect[] {
  return Object.entries(blocImpact).map(([blocId, impact]) => ({
    blocId,
    utilityDelta: impact / 100,
    salience: 1,
  }))
}

function motionKind(motion: { kind?: string; category?: string }): string {
  return motion.kind ?? (motion.category === 'budget' ? 'budget' : 'ordinary')
}

function inferGovernmentState(world: MigratableWorld): GovernmentState {
  if (world.government) return world.government

  const week = world.week ?? 1
  const electionNumber = world.electionsHeld ?? 0

  if (world.needsCoalition) {
    return {
      status: 'forming',
      kind: 'caretaker',
      leadPartyId: largestPartyId(world) ?? world.playerPartyId,
      partnerPartyIds: [],
      formedWeek: week,
      electionNumber,
    }
  }

  if (world.isGoverning) {
    const leadPartyId = world.playerPartyId
    if (world.coalitionPartnerId) {
      return {
        status: 'formed',
        kind: 'coalition',
        leadPartyId,
        partnerPartyIds: [world.coalitionPartnerId],
        formedWeek: week,
        electionNumber,
      }
    }
    if (world.minorityGovernment) {
      return {
        status: 'formed',
        kind: 'minority',
        leadPartyId,
        partnerPartyIds: [],
        formedWeek: week,
        electionNumber,
      }
    }
    return {
      status: 'formed',
      kind: 'majority',
      leadPartyId,
      partnerPartyIds: [],
      formedWeek: week,
      electionNumber,
    }
  }

  const mayorParty = world.parties.find((party) => party.name === world.currentMayorParty)
  const leadPartyId = mayorParty?.id ?? largestPartyId(world) ?? world.playerPartyId
  const leadResult = world.nationalResults.find((result) => result.partyId === leadPartyId)
  const majority = world.stats?.councilMajority ?? Math.floor(world.constituencies.length / 2) + 1
  let kind: GovernmentKind = 'caretaker'
  if (electionNumber > 0) {
    kind = (leadResult?.seatsWon ?? 0) >= majority ? 'majority' : 'minority'
  }

  return {
    status: 'formed',
    kind,
    leadPartyId,
    partnerPartyIds: [],
    formedWeek: week,
    electionNumber,
  }
}

function convertAlliancePact(world: MigratableWorld, proposal: AlliancePact): ElectoralPact {
  const partyIds = [proposal.partyAId, proposal.partyBId].sort() as [string, string]
  const commitments: PactCommitment[] = []
  let idx = 0
  for (const entry of proposal.entries) {
    idx += 1
    commitments.push({
      id: `${proposal.id}-c-${idx}`,
      standingDownPartyId: proposal.partyAId,
      wardId: entry.wardA,
      beneficiaryPartyId: proposal.partyBId,
      endorsementShare: entry.endorsementForB,
      status: proposal.broken ? 'withdrawn' : 'active',
    })
    if (!entry.isUnilateral) {
      idx += 1
      commitments.push({
        id: `${proposal.id}-c-${idx}`,
        standingDownPartyId: proposal.partyBId,
        wardId: entry.wardB,
        beneficiaryPartyId: proposal.partyAId,
        endorsementShare: entry.endorsementForA,
        status: proposal.broken ? 'withdrawn' : 'active',
      })
    }
  }
  return {
    id: proposal.id,
    partyIds,
    electionNumber: Math.max(0, world.electionsHeld),
    createdWeek: proposal.createdAtWeek,
    status: proposal.broken ? 'broken' : 'active',
    commitments,
    brokenWeek: proposal.broken ? proposal.expiresWeek : undefined,
  }
}

function migrateAlliancePacts(world: MigratableWorld): ElectoralPact[] {
  if (world.electoralPacts?.length) return [...world.electoralPacts]
  return (world.alliancePacts ?? []).map((pact) => convertAlliancePact(world, pact))
}

function migratePactTrust(world: MigratableWorld): Record<string, number> {
  if (world.pactTrust && Object.keys(world.pactTrust).length > 0) {
    return { ...world.pactTrust }
  }
  const trust: Record<string, number> = {}
  for (const [key, penalty] of Object.entries(world.allianceReputation ?? {})) {
    trust[key] = -penalty
  }
  return trust
}

function inferActivePolicies(pm: PoliticianModeState): EnactedPolicy[] {
  if (pm.activePolicies?.length) return [...pm.activePolicies]

  const repealedTargetIds = new Set(
    pm.legislationHistory
      .filter((motion) => motionKind(motion) === 'repeal' && motion.targetMotionId)
      .map((motion) => motion.targetMotionId as string),
  )
  const repealedMotionIds = new Set(
    pm.legislationHistory.filter((motion) => motion.status === 'repealed').map((motion) => motion.id),
  )

  return pm.legislationHistory
    .filter((motion) =>
      motion.status === 'passed'
      && motionKind(motion) === 'ordinary'
      && !repealedMotionIds.has(motion.id)
      && !repealedTargetIds.has(motion.id),
    )
    .map((motion) => ({
      id: `policy_${motion.id}`,
      originatingMotionId: motion.id,
      headline: motion.headline,
      category: motion.category,
      sponsorPartyId: motion.proposerPartyId,
      governmentLeadPartyIdAtPass: motion.proposerPartyId,
      enactedWeek: 1,
      effects: motion.effects.length > 0 ? motion.effects : policyEffectsFromBlocImpact(motion.blocImpact),
    }))
}

function inferBudgetEvents(pm: PoliticianModeState): BudgetEvent[] {
  if (pm.budgetEvents?.length) return [...pm.budgetEvents]
  return (pm.budgetHistory ?? []).map((entry, index) => ({
    week: entry.week,
    outcome: entry.passed ? 'passed' as const : 'failed' as const,
    proposerPartyId: '',
    motionId: `budget-migrated-${entry.week}-${index}`,
  }))
}

function migrateCareerRank(oldTier: string): CareerRank {
  if (oldTier === 'mayor') return 'party-leader'
  if (oldTier === 'deputy-leader' || oldTier === 'committee-chair') return 'party-whip'
  if (oldTier === 'party-leader' || oldTier === 'party-whip' || oldTier === 'backbencher') {
    return oldTier
  }
  return 'backbencher'
}

function migrateV2ToV3(data: SaveData): SaveData {
  const world = structuredClone(data.world) as MigratableWorld

  if (world.politicianMode?.politician) {
    const pol = world.politicianMode.politician
    const oldTier = pol.careerTier ?? pol.careerRank ?? 'backbencher'
    const newRank = migrateCareerRank(oldTier)
    pol.careerRank = newRank
    pol.careerTier = newRank
    if (oldTier === 'mayor') {
      world.victory = {
        mayorFirstAchievedWeek: world.week,
        mayorFirstAchievedElection: world.electionsHeld,
        victoryScreenSeen: true,
      }
    }
    if (newRank === 'party-leader') {
      const party = world.parties.find((entry) => entry.id === world.playerPartyId)
      if (party && pol.name) {
        party.leader = pol.name
      }
    }
    pol.careerHistory = pol.careerHistory.map((event) => ({
      ...event,
      rank: event.rank ?? migrateCareerRank(event.tier),
      tier: event.tier ?? event.rank ?? 'backbencher',
    }))
  }

  world.government = inferGovernmentState(world)
  world.electoralPacts = migrateAlliancePacts(world)
  world.pactTrust = migratePactTrust(world)

  if (world.politicianMode) {
    world.politicianMode.activePolicies = inferActivePolicies(world.politicianMode)
    world.politicianMode.budgetEvents = inferBudgetEvents(world.politicianMode)
  }

  return { ...data, version: 3, world }
}

function migrateV1ToV2(data: Record<string, unknown>): SaveData {
  const prev = data.previousWorld as World | null
  return {
    version: 2,
    savedAt: (data.savedAt as string) ?? new Date().toISOString(),
    constituencyCount: (data.constituencyCount as number) ?? 7,
    world: structuredClone(data.world) as World,
    previousNationalResults: prev?.nationalResults ?? null,
  }
}

function normalizeSave(data: SaveData): SaveData {
  const w = data.world
  if (w.gameMode !== 'single-politician') w.gameMode = 'single-politician'
  if (!w.politicianMode) w.politicianMode = initializePoliticianMode(w)
  if (w.politicianMode) {
    if (!w.politicianMode.autoCampaigns) w.politicianMode.autoCampaigns = []
    else w.politicianMode.autoCampaigns = w.politicianMode.autoCampaigns.slice(0, 1)
    if (!w.politicianMode.legislationHistory) w.politicianMode.legislationHistory = []
    if (typeof w.politicianMode.politician.wardId !== 'string') w.politicianMode.politician.wardId = ''
    if (typeof w.politicianMode.councilSessionInterval !== 'number' || w.politicianMode.councilSessionInterval < 8) {
      w.politicianMode.councilSessionInterval = 8
    }
    if (w.politicianMode.nextOrdinaryKind !== 'member' && w.politicianMode.nextOrdinaryKind !== 'government') {
      w.politicianMode.nextOrdinaryKind = 'government'
    }
    if (typeof w.politicianMode.nextBudgetWeek !== 'number') {
      w.politicianMode.nextBudgetWeek = w.week + w.electionCycleWeeks
    }
    if (!Array.isArray(w.politicianMode.budgetHistory)) w.politicianMode.budgetHistory = []
    if (!Array.isArray(w.politicianMode.budgetEvents)) w.politicianMode.budgetEvents = []
    if (!Array.isArray(w.politicianMode.activePolicies)) w.politicianMode.activePolicies = []
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
    if (!w.politicianMode.politician.careerRank) {
      w.politicianMode.politician.careerRank = migrateCareerRank(
        w.politicianMode.politician.careerTier ?? 'backbencher',
      )
    }
    if (!w.politicianMode.politician.careerTier) {
      w.politicianMode.politician.careerTier = w.politicianMode.politician.careerRank
    }
  }
  if (!w.electoralPacts) w.electoralPacts = []
  if (!w.pactTrust) w.pactTrust = {}
  if (!w.alliancePacts) w.alliancePacts = []
  if (!w.councilHistory) w.councilHistory = []
  if (!w.budget) w.budget = getDefaultBudget()
  else w.budget = normalizeBudget(w.budget)
  if (w.politicianMode?.proposedBudget) {
    w.politicianMode.proposedBudget = normalizeBudget(w.politicianMode.proposedBudget)
  }
  if (!w.allianceReputation) w.allianceReputation = {}
  if (!w.partyAffinityMatrix) w.partyAffinityMatrix = {}
  w.constituencies = w.constituencies.map((constituency) => ({
    ...constituency,
    tacticalPressure: Object.fromEntries(w.parties.map((party) => [
      party.id,
      constituency.tacticalPressure?.[party.id] ?? 1,
    ])),
  }))
  if (!w.voteHistory) w.voteHistory = []
  if (!w.electionSeatHistory) w.electionSeatHistory = []
  if (!w.newsFeed) w.newsFeed = []
  if (w.pendingActionToast) w.pendingActionToast = undefined
  if (!w.simToasts) w.simToasts = []
  if (!w.activeCampaigns) w.activeCampaigns = []
  else w.activeCampaigns = []
  w.maxActionPoints = 1
  w.playerActionPoints = Math.min(1, Math.max(0, w.playerActionPoints ?? 1))
  if (!w.actionsThisWeek) w.actionsThisWeek = []
  if (!w.electionNightResults) w.electionNightResults = []
  if (!w.electionNightPreviousSeats) w.electionNightPreviousSeats = {}
  if (w.electionsHeld == null) w.electionsHeld = 0
  if (!w.governanceDecisions) w.governanceDecisions = []
  if (!w.government) w.government = inferGovernmentState(w as MigratableWorld)
  w.parties = w.parties.map((party) => normalizePartyIdentity(party))
  return data
}

function migrateSave(data: Record<string, unknown>): SaveData | null {
  const version = (data.version as number) ?? 1

  if (version > CURRENT_VERSION) return null

  let save: SaveData
  if (version === 1) {
    save = migrateV1ToV2(data)
  } else {
    save = {
      version: version as number,
      savedAt: (data.savedAt as string) ?? new Date().toISOString(),
      constituencyCount: (data.constituencyCount as number) ?? 7,
      world: structuredClone(data.world) as World,
      previousNationalResults: (data.previousNationalResults as PartyPerformance[] | null) ?? null,
    }
  }

  if (save.version < 3) {
    save = migrateV2ToV3(save)
  }

  return normalizeSave(save)
}

function validateWorldStructure(w: unknown): w is World {
  if (!w || typeof w !== 'object') return false
  const world = w as Record<string, unknown>
  return (
    typeof world.seed === 'number'
    && typeof world.week === 'number'
    && typeof world.townName === 'string'
    && Array.isArray(world.parties)
    && Array.isArray(world.constituencies)
    && Array.isArray(world.tiles)
    && typeof world.playerPartyId === 'string'
  )
}

function validateWorldV3(w: World): boolean {
  const partyIds = new Set(w.parties.map((party) => party.id))
  if (!partyIds.has(w.playerPartyId)) return false

  const wardIds = new Set(w.constituencies.map((constituency) => constituency.id))

  if (w.government) {
    if (!partyIds.has(w.government.leadPartyId)) return false
    for (const partnerId of w.government.partnerPartyIds) {
      if (!partyIds.has(partnerId)) return false
    }
  }

  if (w.politicianMode?.politician?.careerRank) {
    if (!VALID_CAREER_RANKS.has(w.politicianMode.politician.careerRank)) return false
  }

  for (const pact of w.electoralPacts ?? []) {
    for (const partyId of pact.partyIds) {
      if (!partyIds.has(partyId)) return false
    }
    for (const commitment of pact.commitments) {
      if (!partyIds.has(commitment.standingDownPartyId)) return false
      if (!partyIds.has(commitment.beneficiaryPartyId)) return false
      if (!wardIds.has(commitment.wardId)) return false
    }
  }

  if (w.politicianMode?.activePolicies) {
    const enactmentIds = new Set<string>()
    for (const policy of w.politicianMode.activePolicies) {
      if (enactmentIds.has(policy.id)) return false
      enactmentIds.add(policy.id)
    }
  }

  return true
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
    if (!validateWorldStructure(parsed.world)) return { error: 'Invalid world data in save' }
    const migrated = migrateSave(parsed)
    if (!migrated) return { error: `Unsupported save version: ${parsed.version}` }
    if (!validateWorldV3(migrated.world)) return { error: 'Invalid world data in save' }
    return { data: migrated }
  } catch {
    return { error: 'Failed to read save' }
  }
}

export function parseSaveData(raw: string): SaveData | null {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!validateWorldStructure(parsed.world)) return null
    const migrated = migrateSave(parsed)
    if (!migrated) return null
    if (!validateWorldV3(migrated.world)) return null
    return migrated
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
    return validateWorldStructure(parsed?.world)
  } catch {
    return false
  }
}
