import { POLICY_TEMPLATES, type PolicyTemplate } from '../../data/policyTemplates'
import type { World } from '../../types/world'
import type {
  CouncilMotion,
  CustomMotionInput,
  MotionCategory,
  MotionContestedness,
  PolicyEffect,
} from '../../types/council'
import type { PoliticalValues } from '../../types/world'
import { VALUE_KEYS } from '../../types/world'
import { createRng } from '../core/random'
import { clamp, roundPoliticalValues } from '../core/math'
import { getRepealablePolicies, blocImpactFromEffects } from './legislation'
import { buildPartyWhips, findWhipIssuer } from './voting'

export const MOTION_PROPOSAL_INFLUENCE_COST = 8
export const BUDGET_AMENDMENT_INFLUENCE_COST = 10

export { POLICY_TEMPLATES }
export type { PolicyTemplate }

function presentBlocIds(world: World): Set<string> {
  return new Set(world.blocs.map((bloc) => bloc.id))
}

export function effectsForTown(effects: PolicyEffect[], present: Set<string>): PolicyEffect[] {
  return effects.filter((effect) => present.has(effect.blocId))
}

function pickTemplate(rng: () => number, recentHeadlines: string[], present: Set<string>, category?: MotionCategory): PolicyTemplate {
  const unused = POLICY_TEMPLATES.filter((template) =>
    !recentHeadlines.some((headline) => headline.toLowerCase() === template.headline.toLowerCase()),
  )
  const byCategory = (list: PolicyTemplate[]) => (
    category ? list.filter((template) => template.category === category) : list
  )
  const localized = (list: PolicyTemplate[]) => list.filter((template) => template.effects.some((effect) => present.has(effect.blocId)))
  const pool = localized(byCategory(unused))
  const fallback = localized(byCategory(POLICY_TEMPLATES))
  const candidates = pool.length > 0 ? pool : fallback.length > 0 ? fallback : byCategory(POLICY_TEMPLATES)
  const choices = candidates.length > 0 ? candidates : POLICY_TEMPLATES
  return choices[Math.floor(rng() * choices.length)]
}

function findProposer(world: World, partyId: string): { id: string; name: string; partyId: string } {
  const pm = world.politicianMode!
  if (pm.politician.partyId === partyId) {
    return { id: pm.politician.id, name: pm.politician.name, partyId }
  }
  const councillor = pm.councillors.find((entry) => entry.partyId === partyId)
  if (councillor) return { id: councillor.id, name: councillor.name, partyId: councillor.partyId }
  const party = world.parties.find((entry) => entry.id === partyId)
  return { id: `party_${partyId}`, name: party?.leader ?? 'Unknown', partyId }
}

function buildCouncilMotion(
  world: World,
  draft: Omit<CouncilMotion, 'partyWhipDirection' | 'whipIssuerId' | 'whipIssuerName' | 'status' | 'votes'>,
): CouncilMotion {
  const motionBase: CouncilMotion = {
    ...draft,
    status: 'proposed',
    votes: [],
    partyWhipDirection: {},
  }
  const whips = buildPartyWhips(world, motionBase)
  const whipIssuer = findWhipIssuer(world, draft.proposerPartyId)
  return {
    ...motionBase,
    partyWhipDirection: whips,
    whipIssuerId: whipIssuer?.id,
    whipIssuerName: whipIssuer?.name,
  }
}

export function generateOrdinaryMotion(world: World, proposerPartyId: string, extraRecent: string[] = []): CouncilMotion {
  const pm = world.politicianMode!
  const rng = createRng(world.seed + world.week * 3331 + proposerPartyId.length * 17 + extraRecent.join('').length)
  const recent = [...(pm.legislationHistory ?? []).map((motion) => motion.headline), ...extraRecent]
  const present = presentBlocIds(world)
  const template = pickTemplate(rng, recent, present)
  const proposer = findProposer(world, proposerPartyId)
  const effects = effectsForTown(template.effects, present)
  const blocImpact = blocImpactFromEffects(effects)

  return buildCouncilMotion(world, {
    id: `motion_${world.week}_${proposerPartyId}_${Math.floor(rng() * 9999)}`,
    proposerId: proposer.id,
    proposerName: proposer.name,
    proposerPartyId: proposer.partyId,
    headline: template.headline,
    description: template.description,
    category: template.category,
    kind: 'ordinary',
    ideologyLean: template.ideologyLean,
    blocImpact,
    effects,
    costSignal: template.costSignal,
    contestedness: template.contestedness,
  })
}

export function generateRepealMotion(world: World, targetEnactmentId: string, proposerPartyId: string): CouncilMotion {
  const target = getRepealablePolicies(world).find((policy) => policy.id === targetEnactmentId)
  if (!target) {
    return generateOrdinaryMotion(world, proposerPartyId)
  }

  const proposer = findProposer(world, proposerPartyId)
  const reversedLean: Partial<PoliticalValues> = {}
  for (const key of VALUE_KEYS) {
    reversedLean[key] = 0
  }

  const present = presentBlocIds(world)
  const effects: PolicyEffect[] = effectsForTown(target.effects, present).map((effect) => ({
    blocId: effect.blocId,
    utilityDelta: -effect.utilityDelta,
    salience: effect.salience,
  }))

  return buildCouncilMotion(world, {
    id: `repeal_${world.week}_${targetEnactmentId}`,
    proposerId: proposer.id,
    proposerName: proposer.name,
    proposerPartyId: proposer.partyId,
    headline: `Repeal: ${target.headline}`,
    description: `Repeal the enacted policy "${target.headline}".`,
    category: target.category,
    kind: 'repeal',
    ideologyLean: reversedLean,
    blocImpact: blocImpactFromEffects(effects),
    effects,
    costSignal: clamp(0.5, 0.2, 1),
    contestedness: 'contested',
    targetMotionId: target.originatingMotionId,
  })
}

function contestednessFromSignals(leanMagnitude: number, costSignal: number): MotionContestedness {
  const score = leanMagnitude / 60 + costSignal
  if (score < 0.85) return 'broad'
  if (score < 1.35) return 'contested'
  return 'divisive'
}

function motionFromInput(world: World, input: CustomMotionInput): Pick<
  CouncilMotion,
  'headline' | 'description' | 'category' | 'kind' | 'ideologyLean' | 'blocImpact' | 'effects' | 'costSignal' | 'contestedness' | 'targetMotionId' | 'budgetProposal'
> {
  const costSignal = input.costSignal ?? clamp(
    (Math.abs(input.ideologyLean.change) + Math.abs(input.ideologyLean.growth) + Math.abs(input.ideologyLean.services)) / 120,
    0.2,
    1,
  )
  const leanMagnitude = Math.abs(input.ideologyLean.change) + Math.abs(input.ideologyLean.growth) + Math.abs(input.ideologyLean.services)
  const contestedness = contestednessFromSignals(leanMagnitude, costSignal)
  const present = presentBlocIds(world)
  const template = input.templateId
    ? POLICY_TEMPLATES.find((entry) => entry.id === input.templateId)
    : POLICY_TEMPLATES.find((entry) => entry.headline.toLowerCase() === input.headline.toLowerCase())
  const effects = effectsForTown(input.effects ?? template?.effects ?? categoryDefaultEffects(input.category, input.ideologyLean), present)
  return {
    headline: input.headline || 'Untitled Motion',
    description: input.description || '',
    category: input.category,
    kind: input.kind ?? (input.targetMotionId ? 'repeal' : 'ordinary'),
    ideologyLean: input.ideologyLean,
    effects,
    blocImpact: blocImpactFromEffects(effects),
    costSignal,
    contestedness,
    targetMotionId: input.targetMotionId,
    budgetProposal: input.budgetProposal,
  }
}

function categoryDefaultEffects(category: MotionCategory, lean: PoliticalValues): PolicyEffect[] {
  const categoryBlocMap: Record<MotionCategory, string[]> = {
    environment: ['river_walkers', 'college_corner'],
    services: ['hill_street_households', 'old_town_loyalists'],
    planning: ['workshop_crews', 'market_regulars'],
    housing: ['hill_street_households', 'college_corner'],
    transport: ['workshop_crews', 'river_walkers'],
    safety: ['pondside_peacemakers', 'market_regulars'],
    economy: ['market_regulars', 'workshop_crews'],
    budget: ['old_town_loyalists', 'market_regulars'],
    governance: ['pondside_peacemakers', 'college_corner'],
  }
  const magnitude = (Math.abs(lean.change) + Math.abs(lean.growth) + Math.abs(lean.services)) / 100
  const blocs = categoryBlocMap[category] ?? ['pondside_peacemakers']
  return blocs.map((blocId, index) => ({
    blocId,
    utilityDelta: magnitude * (index === 0 ? 1 : -0.6),
    salience: 1,
  }))
}

export function customMotionToCouncilMotion(world: World, input: CustomMotionInput, motionId: string): CouncilMotion {
  const pm = world.politicianMode!
  const generated = motionFromInput(world, input)
  return buildCouncilMotion(world, {
    id: motionId,
    proposerId: pm.politician.id,
    proposerName: pm.politician.name,
    proposerPartyId: pm.politician.partyId,
    ...generated,
  })
}

export function queueCustomMotion(world: World, input: CustomMotionInput): World {
  const pm = world.politicianMode
  if (!pm || !pm.politician.isIncumbent) return world
  const cost = input.kind === 'budget' ? BUDGET_AMENDMENT_INFLUENCE_COST : MOTION_PROPOSAL_INFLUENCE_COST
  if (pm.queuedMotion || pm.politician.influence < cost) return world
  return {
    ...world,
    newsFeed: [`Week ${world.week}: You queued "${input.headline}" for the next ${input.kind === 'budget' ? 'budget' : 'member'} session (−${cost} influence).`, ...world.newsFeed].slice(0, 30),
    politicianMode: {
      ...pm,
      politician: {
        ...pm.politician,
        influence: pm.politician.influence - cost,
        careerHistory: [...pm.politician.careerHistory, { week: world.week, description: `Queued motion: ${input.headline}`, tier: pm.politician.careerTier, rank: pm.politician.careerRank }],
      },
      queuedMotion: input,
    },
  }
}

export function queueRepealMotion(world: World, targetId: string, rationale?: string): World {
  const pm = world.politicianMode
  if (!pm || !pm.politician.isIncumbent) return world
  const fromPolicy = getRepealablePolicies(world).find((policy) => policy.id === targetId || policy.originatingMotionId === targetId)
  if (fromPolicy) {
    return queueCustomMotion(world, {
      headline: `Repeal: ${fromPolicy.headline}`,
      description: rationale || `Repeal the enacted policy "${fromPolicy.headline}".`,
      category: fromPolicy.category,
      ideologyLean: roundPoliticalValues({ change: 0, growth: 0, services: 0 }),
      kind: 'repeal',
      targetMotionId: fromPolicy.originatingMotionId,
      costSignal: 0.7,
      effects: fromPolicy.effects.map((effect) => ({
        ...effect,
        utilityDelta: -effect.utilityDelta,
      })),
    })
  }
  const fromHistory = pm.legislationHistory.find((motion) => motion.id === targetId && motion.status === 'passed')
  if (!fromHistory) return world
  return queueCustomMotion(world, {
    headline: `Repeal: ${fromHistory.headline}`,
    description: rationale || `Repeal the previously passed motion "${fromHistory.headline}".`,
    category: fromHistory.category,
    ideologyLean: {
      change: -(fromHistory.ideologyLean.change ?? 0),
      growth: -(fromHistory.ideologyLean.growth ?? 0),
      services: -(fromHistory.ideologyLean.services ?? 0),
    },
    kind: 'repeal',
    targetMotionId: targetId,
    costSignal: Math.min(1, (fromHistory.costSignal ?? 0.5) + 0.2),
    effects: fromHistory.effects.map((effect) => ({
      ...effect,
      utilityDelta: -effect.utilityDelta,
    })),
  })
}

export function suggestTemplateMotion(
  world: World,
  recentHeadlines: string[] = [],
  category?: MotionCategory,
  salt = 0,
): CustomMotionInput & { contestedness: MotionContestedness } {
  const rng = createRng(world.seed + world.week * 97 + salt * 131 + (category?.length ?? 0) * 11)
  const present = presentBlocIds(world)
  const template = pickTemplate(rng, recentHeadlines, present, category)
  const effects = effectsForTown(template.effects, present)
  return {
    headline: template.headline,
    description: template.description,
    category: template.category,
    ideologyLean: {
      change: template.ideologyLean.change ?? 0,
      growth: template.ideologyLean.growth ?? 0,
      services: template.ideologyLean.services ?? 0,
    },
    kind: 'ordinary',
    costSignal: template.costSignal,
    effects,
    templateId: template.id,
    contestedness: template.contestedness,
  }
}

export function templatesForCategory(category: MotionCategory, recentHeadlines: string[] = []): PolicyTemplate[] {
  const unused = POLICY_TEMPLATES.filter((template) =>
    template.category === category
    && !recentHeadlines.some((headline) => headline.toLowerCase() === template.headline.toLowerCase()),
  )
  return unused.length > 0 ? unused : POLICY_TEMPLATES.filter((template) => template.category === category)
}
