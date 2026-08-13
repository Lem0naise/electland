import type { World } from '../../types/world'
import type {
  CouncilMotion,
  CouncilMotionVote,
  CouncilSession,
  CouncilSessionKind,
  OrdinarySessionKind,
  PoliticianModeState,
} from '../../types/council'
import type { Relationship } from '../../types/politics'
import { createRng } from '../core/random'
import { clamp } from '../core/math'
import {
  customMotionToCouncilMotion,
  generateOrdinaryMotion,
  generateRepealMotion,
} from './motions'
import {
  applyBudgetEffects,
  budgetIdeologyLean,
  handleBudgetFailure,
  normalizeBudget,
  recordBudgetEvent,
  aggregateBudgetBlocEffects,
} from './budget'
import { enactPolicy, getActivePolicies, repealPolicy } from './legislation'
import {
  buildPartyWhips,
  calculateNpcVote,
  findWhipIssuer,
  getGovernmentLeadPartyId,
  motionPassed,
} from './voting'

function pickNpcProposerParty(world: World, motion: CouncilMotion): string {
  const pm = world.politicianMode!
  const directions = buildPartyWhips(world, motion)
  const ayePartyIds = new Set(Object.entries(directions).filter(([, direction]) => direction === 'aye').map(([id]) => id))
  const rng = createRng(world.seed + world.week * 3331)
  const ayeCouncillors = pm.councillors.filter((entry) => ayePartyIds.has(entry.partyId))
  if (ayeCouncillors.length > 0) {
    return ayeCouncillors[Math.floor(rng() * ayeCouncillors.length)].partyId
  }
  const sorted = [...pm.councillors].sort((a, b) => a.influence - b.influence)
  return sorted[sorted.length - 1]?.partyId ?? pm.politician.partyId
}

function attachPlayerVote(motion: CouncilMotion, vote?: 'aye' | 'nay' | 'abstain'): CouncilMotion {
  if (!vote) return motion
  return { ...motion, playerVote: vote }
}

function buildBudgetMotion(world: World, motionId: string): CouncilMotion {
  const pm = world.politicianMode!
  const amendment = pm.queuedMotion?.kind === 'budget' && pm.queuedMotion.budgetProposal ? pm.queuedMotion : undefined
  const proposed = normalizeBudget(amendment?.budgetProposal ?? pm.proposedBudget ?? world.budget)
  const lean = budgetIdeologyLean(proposed)
  const govLeadId = getGovernmentLeadPartyId(world)
  const proposerPartyId = amendment
    ? pm.politician.partyId
    : govLeadId ?? pickNpcProposerParty(world, {
      id: motionId,
      proposerId: '',
      proposerName: '',
      proposerPartyId: govLeadId ?? pm.politician.partyId,
      headline: '',
      description: '',
      category: 'budget',
      kind: 'budget',
      ideologyLean: lean,
      blocImpact: {},
      effects: [],
      costSignal: 0.35,
      contestedness: 'broad',
      status: 'proposed',
      votes: [],
      partyWhipDirection: {},
    })

  const proposer = proposerPartyId === pm.politician.partyId
    ? { id: pm.politician.id, name: pm.politician.name, partyId: pm.politician.partyId }
    : (() => {
      const cllr = pm.councillors.find((entry) => entry.partyId === proposerPartyId)
      if (cllr) return { id: cllr.id, name: cllr.name, partyId: cllr.partyId }
      const party = world.parties.find((entry) => entry.id === proposerPartyId)
      return { id: `party_${proposerPartyId}`, name: party?.leader ?? 'Unknown', partyId: proposerPartyId }
    })()

  const blocImpact = aggregateBudgetBlocEffects(proposed)
  const draft: CouncilMotion = {
    id: motionId,
    proposerId: proposer.id,
    proposerName: proposer.name,
    proposerPartyId: proposer.partyId,
    headline: amendment ? amendment.headline : 'Adopt the council budget',
    description: amendment
      ? amendment.description
      : 'Approve the governing administration\'s balanced service allocations for the coming year.',
    category: 'budget',
    kind: 'budget',
    ideologyLean: lean,
    blocImpact,
    effects: [],
    costSignal: amendment ? 0.55 : 0.35,
    contestedness: amendment ? 'contested' : 'broad',
    status: 'proposed',
    votes: [],
    partyWhipDirection: {},
    budgetProposal: proposed,
    playerVote: proposer.id === pm.politician.id ? 'aye' : undefined,
  }
  const whips = buildPartyWhips(world, draft)
  const whipIssuer = findWhipIssuer(world, proposer.partyId)
  return { ...draft, partyWhipDirection: whips, whipIssuerId: whipIssuer?.id, whipIssuerName: whipIssuer?.name }
}

function queuedMemberMotion(pm: PoliticianModeState) {
  if (!pm.queuedMotion || pm.queuedMotion.kind === 'budget') return undefined
  return pm.queuedMotion
}

function pickMemberProposerParty(world: World): string {
  const pm = world.politicianMode!
  const govLeadId = getGovernmentLeadPartyId(world)
  const rng = createRng(world.seed + world.week * 3331 + 91)
  const others = pm.councillors.filter((entry) => entry.partyId !== govLeadId)
  const pool = others.length > 0 ? others : pm.councillors
  if (pool.length === 0) return pm.politician.partyId
  return pool[Math.floor(rng() * pool.length)].partyId
}

function buildMemberMotion(world: World, motionId: string, extraRecent: string[] = []): CouncilMotion {
  const pm = world.politicianMode!
  const queued = queuedMemberMotion(pm)
  if (queued) {
    const motion = customMotionToCouncilMotion(world, queued, motionId)
    if (queued.kind === 'repeal' && queued.targetMotionId) {
      const enactment = getActivePolicies(world).find((policy) => policy.originatingMotionId === queued.targetMotionId)
      if (enactment) {
        return generateRepealMotion(world, enactment.id, pm.politician.partyId)
      }
    }
    return attachPlayerVote(motion, 'aye')
  }
  return generateOrdinaryMotion(world, pickMemberProposerParty(world), extraRecent)
}

function buildGovernmentMotion(world: World, motionId: string): CouncilMotion {
  const govLeadId = getGovernmentLeadPartyId(world)
  const partyId = govLeadId ?? pickNpcProposerParty(world, generateOrdinaryMotion(world, world.playerPartyId))
  const motion = generateOrdinaryMotion(world, partyId)
  return { ...motion, id: motionId }
}

export function ordinarySessionKind(pm: PoliticianModeState): OrdinarySessionKind {
  return pm.nextOrdinaryKind === 'member' ? 'member' : 'government'
}

function advanceOrdinaryKind(session: CouncilSession, current: OrdinarySessionKind): OrdinarySessionKind {
  if (session.kind === 'budget' || session.budgetSession) return current
  if (session.kind === 'member') return 'government'
  if (session.kind === 'government') return 'member'
  return current === 'government' ? 'member' : 'government'
}

function createSession(world: World, motions: CouncilMotion[], kind: CouncilSessionKind): CouncilSession {
  return {
    week: world.week,
    motions,
    activeMotionIndex: 0,
    phase: 'agenda',
    resolved: false,
    budgetSession: kind === 'budget',
    kind,
  }
}

export function generateBudgetSession(world: World): World {
  if (!world.politicianMode?.politician.isIncumbent) return world
  const pm = world.politicianMode
  const budgetMotion = buildBudgetMotion(world, `budget_${world.week}`)
  const clearQueuedBudget = pm.queuedMotion?.kind === 'budget' ? undefined : pm.queuedMotion
  return {
    ...world,
    politicianMode: {
      ...pm,
      queuedMotion: clearQueuedBudget,
      proposedBudget: budgetMotion.budgetProposal ?? pm.proposedBudget,
      currentSession: createSession(world, [budgetMotion], 'budget'),
    },
  }
}

export function generateCouncilSession(world: World): World {
  if (!world.politicianMode) return world
  const pm = world.politicianMode
  if (!pm.politician.isIncumbent) return world

  const budgetDue = world.week >= pm.nextBudgetWeek
  const ordinaryDue = world.week >= pm.nextSessionWeek
  if (budgetDue && ordinaryDue) {
    return generateCouncilSession({
      ...world,
      politicianMode: { ...pm, nextBudgetWeek: world.week + 1 },
    })
  }

  if (budgetDue && !ordinaryDue) {
    return generateBudgetSession(world)
  }

  const kind = ordinarySessionKind(pm)
  if (kind === 'member') {
    const hadQueuedMember = Boolean(queuedMemberMotion(pm))
    const memberMotion = buildMemberMotion(world, `motion_${world.week}_1`)
    return {
      ...world,
      politicianMode: {
        ...pm,
        queuedMotion: hadQueuedMember ? undefined : pm.queuedMotion,
        currentSession: createSession(world, [memberMotion], 'member'),
      },
    }
  }

  const govMotion = buildGovernmentMotion(world, `motion_${world.week}_0`)
  const directions = buildPartyWhips(world, govMotion)
  const proposerPartyId = govMotion.proposerPartyId
  if (directions[proposerPartyId] !== 'aye') {
    govMotion.partyWhipDirection = { ...govMotion.partyWhipDirection, [proposerPartyId]: 'aye' }
  }

  return {
    ...world,
    politicianMode: {
      ...pm,
      currentSession: createSession(world, [govMotion], 'government'),
    },
  }
}

function collectVotesForMotion(world: World, motion: CouncilMotion): CouncilMotionVote[] {
  const pm = world.politicianMode!
  const seen = new Set<string>()
  const votes: CouncilMotionVote[] = []

  for (const cllr of pm.councillors) {
    if (seen.has(cllr.id)) continue
    seen.add(cllr.id)
    const whip = motion.partyWhipDirection[cllr.partyId] ?? 'free'
    const vote = calculateNpcVote(world, cllr.id, motion, whip)
    votes.push({ councillorId: cllr.id, councillorName: cllr.name, partyId: cllr.partyId, vote })
  }

  if (motion.playerVote && !seen.has(pm.politician.id)) {
    votes.push({
      councillorId: pm.politician.id,
      councillorName: pm.politician.name,
      partyId: pm.politician.partyId,
      vote: motion.playerVote,
    })
  }

  return votes
}

function playerMustVote(world: World): boolean {
  return Boolean(world.politicianMode?.politician.isIncumbent)
}

function playerHasVotedOnAllMotions(session: CouncilSession): boolean {
  return session.motions.every((motion) => motion.playerVote != null)
}

export function resolveCouncilSession(world: World): World {
  const pm = world.politicianMode
  const session = pm?.currentSession
  if (!pm || !session) return world
  if (session.resolved) return world
  if (playerMustVote(world) && !playerHasVotedOnAllMotions(session)) return world

  let nextWorld = world
  const resolvedMotions: CouncilMotion[] = session.motions.map((motion) => {
    const votes = collectVotesForMotion(nextWorld, motion)
    const passed = motionPassed(votes)
    return {
      ...motion,
      votes,
      status: passed ? 'passed' : 'failed',
    }
  })

  let pol = pm.politician
  let motionsPassed = pol.motionsPassed
  let motionsProposed = pol.motionsProposed
  let loyaltyChange = 0
  let rebellionCount = 0
  let reputationChange = 0
  let influenceChange = 0
  let legislationHistory = [...pm.legislationHistory]
  let imposedCompromiseBudget = false

  for (const motion of resolvedMotions) {
    if (motion.proposerId === pol.id) motionsProposed += 1
    if (motion.proposerId === pol.id && motion.status === 'passed') motionsPassed += 1

    if (motion.playerVote) {
      const whip = motion.partyWhipDirection[pol.partyId]
      const rebelled = whip !== 'free' && whip != null && motion.playerVote !== whip
      if (rebelled) {
        rebellionCount += 1
        loyaltyChange -= (12 - (pol.traits.some((trait) => trait.id === 'maverick') ? 4 : 0))
        reputationChange += 4
        influenceChange += 2
      } else if (whip !== 'free') {
        loyaltyChange += 2
      }
      if (motion.playerVote === 'aye' && motion.status === 'passed') influenceChange += 1
    }

    if (motion.status === 'passed') {
      if (motion.kind === 'budget' && motion.budgetProposal) {
        nextWorld = applyBudgetEffects(nextWorld, motion.budgetProposal)
        nextWorld = recordBudgetEvent(
          nextWorld,
          'passed',
          motion.proposerPartyId,
          motion.budgetProposal,
          motion.id,
        )
        const nextPm = nextWorld.politicianMode!
        nextWorld = {
          ...nextWorld,
          politicianMode: {
            ...nextPm,
            proposedBudget: undefined,
            nextBudgetWeek: world.week + world.electionCycleWeeks,
          },
        }
      } else if (motion.kind === 'ordinary') {
        nextWorld = enactPolicy(nextWorld, motion)
      } else if (motion.kind === 'repeal' && motion.targetMotionId) {
        const enactment = getActivePolicies(nextWorld).find((policy) => policy.originatingMotionId === motion.targetMotionId)
        if (enactment) {
          nextWorld = repealPolicy(nextWorld, enactment.id, motion.id)
        }
        legislationHistory = legislationHistory.map((entry) => (
          entry.id === motion.targetMotionId
            ? { ...entry, status: 'repealed', repealedById: motion.id }
            : entry
        ))
      }
    } else if (motion.kind === 'budget') {
      nextWorld = recordBudgetEvent(nextWorld, 'failed', motion.proposerPartyId, motion.budgetProposal, motion.id)
      nextWorld = handleBudgetFailure(nextWorld)
      const lastEvent = nextWorld.politicianMode?.budgetEvents?.[nextWorld.politicianMode.budgetEvents.length - 1]
      if (lastEvent?.outcome === 'officer-imposed') imposedCompromiseBudget = true
    }
  }

  if (pol.traits.some((trait) => trait.id === 'policy-wonk')) influenceChange += 2
  pol = {
    ...pol,
    motionsPassed,
    motionsProposed,
    rebellions: pol.rebellions + rebellionCount,
    partyLoyalty: clamp(pol.partyLoyalty + loyaltyChange, 0, 100),
    reputation: clamp(pol.reputation + reputationChange, 0, 100),
    influence: clamp(pol.influence + influenceChange, 0, 100),
  }

  const networkerBonus = pol.traits.some((trait) => trait.id === 'networker') ? 2 : 0
  const updatedRelationships = pol.relationships.map((rel) => {
    let strengthDelta = networkerBonus
    const history = [...rel.history]
    const sameParty = rel.partyId === pol.partyId
    for (const motion of resolvedMotions) {
      if (!motion.playerVote) continue
      const cllrVote = motion.votes.find((vote) => vote.councillorId === rel.targetId)
      if (!cllrVote) continue
      const isProposer = motion.proposerId === rel.targetId
      if (cllrVote.vote === motion.playerVote) {
        const agreeBonus = isProposer && motion.playerVote === 'aye' ? (motion.kind === 'repeal' ? 12 : 10) : 5
        strengthDelta += sameParty ? agreeBonus + 2 : agreeBonus
        if (history.length < 5) {
          history.push(`${isProposer && motion.playerVote === 'aye' ? 'Supported their motion' : 'Agreed on'}: ${motion.headline}`)
        }
      } else if (motion.playerVote !== 'abstain' && cllrVote.vote !== 'abstain') {
        strengthDelta -= isProposer ? (motion.kind === 'repeal' ? 10 : 8) : 4
        if (history.length < 5) {
          history.push(`${isProposer ? 'Opposed their motion' : 'Disagreed on'}: ${motion.headline}`)
        }
      }
    }
    const newStrength = clamp(rel.strength + strengthDelta, -100, 100)
    const newType: Relationship['type'] = newStrength > 40 ? 'ally' : newStrength < -30 ? 'rival' : rel.type === 'mentor' ? 'mentor' : 'neutral'
    return { ...rel, strength: newStrength, type: newType, history: history.slice(-8) }
  })
  pol = { ...pol, relationships: updatedRelationships }

  const passedCount = resolvedMotions.filter((motion) => motion.status === 'passed').length
  const failedCount = resolvedMotions.filter((motion) => motion.status === 'failed').length
  const councilNews = resolvedMotions.map((motion) => {
    if (motion.kind === 'budget' && motion.status === 'failed' && imposedCompromiseBudget) {
      return `Week ${world.week}: After three failed votes, officers impose a compromise budget.`
    }
    return `Week ${world.week}: Council ${motion.status === 'passed' ? 'passes' : 'rejects'} "${motion.headline}".`
  })

  const nextPm = nextWorld.politicianMode ?? pm
  return {
    ...nextWorld,
    newsFeed: [...councilNews, ...nextWorld.newsFeed].slice(0, 30),
    politicianMode: {
      ...nextPm,
      politician: pol,
      currentSession: { ...session, motions: resolvedMotions, resolved: true, phase: 'resolved' },
      sessionHistory: [...pm.sessionHistory, { week: world.week, motionsPassed: passedCount, motionsFailed: failedCount }],
      legislationHistory: [...legislationHistory, ...resolvedMotions].slice(-40),
      nextSessionWeek: world.week + pm.councilSessionInterval,
      nextOrdinaryKind: advanceOrdinaryKind(session, ordinarySessionKind(pm)),
    },
  }
}

export function shouldTriggerCouncilSession(world: World): boolean {
  if (!world.politicianMode) return false
  if (!world.politicianMode.politician.isIncumbent) return false
  if (world.politicianMode.currentSession && !world.politicianMode.currentSession.resolved) return false
  if (world.electionNightActive) return false
  const pm = world.politicianMode
  return world.week >= pm.nextSessionWeek || world.week >= pm.nextBudgetWeek
}
