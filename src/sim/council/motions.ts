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

interface PolicyTemplate {
  category: MotionCategory
  headline: string
  description: string
  ideologyLean: Partial<PoliticalValues>
  effects: PolicyEffect[]
  costSignal: number
  contestedness: MotionContestedness
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    category: 'services',
    headline: 'Restore library opening hours',
    description: 'Reopen branch libraries for evening access funded from reserves.',
    ideologyLean: { services: 22 },
    effects: [
      { blocId: 'old_town_loyalists', utilityDelta: 0.10, salience: 1.1 },
      { blocId: 'college_corner', utilityDelta: 0.08, salience: 1.0 },
      { blocId: 'hill_street_households', utilityDelta: 0.06, salience: 0.9 },
    ],
    costSignal: 0.45,
    contestedness: 'contested',
  },
  {
    category: 'transport',
    headline: 'Expand evening bus services',
    description: 'Subsidise late buses linking outer wards to the town centre.',
    ideologyLean: { services: 18, growth: 8 },
    effects: [
      { blocId: 'workshop_crews', utilityDelta: 0.09, salience: 1.0 },
      { blocId: 'river_walkers', utilityDelta: 0.05, salience: 0.8 },
      { blocId: 'market_regulars', utilityDelta: -0.03, salience: 0.7 },
    ],
    costSignal: 0.55,
    contestedness: 'contested',
  },
  {
    category: 'environment',
    headline: 'Protect riverside habitats',
    description: 'Designate a buffer zone along the towpath with tree-planting grants.',
    ideologyLean: { change: 24 },
    effects: [
      { blocId: 'river_walkers', utilityDelta: 0.11, salience: 1.2 },
      { blocId: 'college_corner', utilityDelta: 0.07, salience: 0.9 },
      { blocId: 'workshop_crews', utilityDelta: -0.04, salience: 0.6 },
    ],
    costSignal: 0.35,
    contestedness: 'broad',
  },
  {
    category: 'planning',
    headline: 'Fast-track town-centre flats',
    description: 'Delegate approval for brownfield housing above existing retail units.',
    ideologyLean: { growth: 20 },
    effects: [
      { blocId: 'market_regulars', utilityDelta: 0.08, salience: 1.0 },
      { blocId: 'workshop_crews', utilityDelta: 0.06, salience: 0.8 },
      { blocId: 'pondside_peacemakers', utilityDelta: -0.05, salience: 0.7 },
    ],
    costSignal: 0.50,
    contestedness: 'contested',
  },
  {
    category: 'housing',
    headline: 'Accelerate social housing delivery',
    description: 'Partner with registered providers to bring forward council-owned sites.',
    ideologyLean: { services: 16, change: 12 },
    effects: [
      { blocId: 'hill_street_households', utilityDelta: 0.10, salience: 1.1 },
      { blocId: 'college_corner', utilityDelta: 0.06, salience: 0.9 },
      { blocId: 'old_town_loyalists', utilityDelta: -0.03, salience: 0.6 },
    ],
    costSignal: 0.60,
    contestedness: 'divisive',
  },
  {
    category: 'safety',
    headline: 'Fund community warden patrols',
    description: 'Expand evening warden coverage near licensed premises.',
    ideologyLean: { services: 14, change: 10 },
    effects: [
      { blocId: 'pondside_peacemakers', utilityDelta: 0.09, salience: 1.0 },
      { blocId: 'market_regulars', utilityDelta: 0.07, salience: 0.9 },
      { blocId: 'college_corner', utilityDelta: -0.04, salience: 0.5 },
    ],
    costSignal: 0.40,
    contestedness: 'broad',
  },
  {
    category: 'economy',
    headline: 'Launch high-street grants scheme',
    description: 'Offer small business rate relief for independent traders on Market Square.',
    ideologyLean: { growth: 18 },
    effects: [
      { blocId: 'market_regulars', utilityDelta: 0.10, salience: 1.1 },
      { blocId: 'workshop_crews', utilityDelta: 0.05, salience: 0.8 },
      { blocId: 'old_town_loyalists', utilityDelta: 0.03, salience: 0.7 },
    ],
    costSignal: 0.30,
    contestedness: 'broad',
  },
  {
    category: 'governance',
    headline: 'Livestream scrutiny meetings',
    description: 'Broadcast committee hearings online under a new transparency charter.',
    ideologyLean: { change: 16 },
    effects: [
      { blocId: 'college_corner', utilityDelta: 0.07, salience: 0.9 },
      { blocId: 'pondside_peacemakers', utilityDelta: 0.05, salience: 0.8 },
    ],
    costSignal: 0.20,
    contestedness: 'broad',
  },
]

function pickTemplate(rng: () => number, recentHeadlines: string[]): PolicyTemplate {
  const shuffled = [...POLICY_TEMPLATES].sort(() => rng() - 0.5)
  for (const template of shuffled) {
    if (!recentHeadlines.some((headline) => headline.toLowerCase() === template.headline.toLowerCase())) {
      return template
    }
  }
  return POLICY_TEMPLATES[0]
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

export function generateOrdinaryMotion(world: World, proposerPartyId: string): CouncilMotion {
  const pm = world.politicianMode!
  const rng = createRng(world.seed + world.week * 3331 + proposerPartyId.length * 17)
  const recent = (pm.legislationHistory ?? []).map((motion) => motion.headline)
  const template = pickTemplate(rng, recent)
  const proposer = findProposer(world, proposerPartyId)
  const effects = template.effects
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

  const effects: PolicyEffect[] = target.effects.map((effect) => ({
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

function motionFromInput(input: CustomMotionInput): Pick<
  CouncilMotion,
  'headline' | 'description' | 'category' | 'kind' | 'ideologyLean' | 'blocImpact' | 'effects' | 'costSignal' | 'contestedness' | 'targetMotionId' | 'budgetProposal'
> {
  const costSignal = input.costSignal ?? clamp(
    (Math.abs(input.ideologyLean.change) + Math.abs(input.ideologyLean.growth) + Math.abs(input.ideologyLean.services)) / 120,
    0.2,
    1,
  )
  const leanMagnitude = Math.abs(input.ideologyLean.change) + Math.abs(input.ideologyLean.growth) + Math.abs(input.ideologyLean.services)
  const contestedness: MotionContestedness = leanMagnitude / 60 + costSignal < 0.85
    ? 'broad'
    : leanMagnitude / 60 + costSignal < 1.35
      ? 'contested'
      : 'divisive'
  const effects = categoryDefaultEffects(input.category, input.ideologyLean)
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
  const generated = motionFromInput(input)
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
    newsFeed: [`Week ${world.week}: You queued "${input.headline}" for the next council session (−${cost} influence).`, ...world.newsFeed].slice(0, 30),
    politicianMode: {
      ...pm,
      politician: {
        ...pm.politician,
        influence: pm.politician.influence - cost,
        careerHistory: [...pm.politician.careerHistory, { week: world.week, description: `Queued motion: ${input.headline}`, tier: pm.politician.careerTier ?? 'backbencher' }],
      },
      queuedMotion: input,
    },
  }
}

export function queueRepealMotion(world: World, targetEnactmentId: string): World {
  const pm = world.politicianMode
  if (!pm || !pm.politician.isIncumbent) return world
  const target = getRepealablePolicies(world).find((policy) => policy.id === targetEnactmentId)
  if (!target) return world
  return queueCustomMotion(world, {
    headline: `Repeal: ${target.headline}`,
    description: `Repeal the enacted policy "${target.headline}".`,
    category: target.category,
    ideologyLean: roundPoliticalValues({ change: 0, growth: 0, services: 0 }),
    kind: 'repeal',
    targetMotionId: target.originatingMotionId,
    costSignal: 0.7,
  })
}

export { POLICY_TEMPLATES }
