import { lobbyCouncillor, simulateWeek } from '../lib/sim'
import { resolveCouncilSession } from '../sim/council/agenda'
import { queueCustomMotion, queueRepealMotion } from '../sim/council/motions'
import { canProposeBudget, normalizeBudget } from '../sim/council/budget'
import { launchLeadershipChallenge, promoteToCommitteeChair } from '../sim/politics/career'
import { resolveGovernmentFormation } from '../sim/politics/government'
import {
  acceptNpcProposal,
  breakPact,
  submitPactProposal,
  withdrawCommitment,
} from '../sim/politics/pacts'
import type { World, Budget } from '../types/world'
import type { CustomMotionInput } from '../types/council'

export type GameAction =
  | { type: 'ADVANCE_WEEK' }
  | { type: 'CAST_VOTE'; motionIndex: number; vote: 'aye' | 'nay' | 'abstain' }
  | { type: 'RESOLVE_SESSION' }
  | { type: 'PROMOTE_TO_COMMITTEE_CHAIR' }
  | { type: 'LAUNCH_LEADERSHIP_CHALLENGE' }
  | { type: 'FORM_GOVERNMENT'; kind: 'majority' | 'minority' | 'coalition'; leadPartyId: string; partnerIds?: string[] }
  | { type: 'SUBMIT_PACT'; proposal: { partnerPartyId: string; commitments: Array<{ standingDownPartyId: string; wardId: string; beneficiaryPartyId: string }> } }
  | { type: 'ACCEPT_NPC_PROPOSAL' }
  | { type: 'WITHDRAW_COMMITMENT'; pactId: string; commitmentId: string }
  | { type: 'BREAK_PACT'; pactId: string }
  | { type: 'QUEUE_MOTION'; input: CustomMotionInput }
  | { type: 'QUEUE_REPEAL'; enactmentId: string }
  | { type: 'PROPOSE_BUDGET'; budget: Budget }
  | { type: 'ACKNOWLEDGE_VICTORY' }
  | { type: 'LOBBY_COUNCILLOR'; councillorId: string; motionId: string; desiredVote: 'aye' | 'nay' }

export function gameReducer(world: World, action: GameAction): World {
  switch (action.type) {
    case 'ADVANCE_WEEK':
      return simulateWeek(world)

    case 'CAST_VOTE': {
      const pm = world.politicianMode
      const session = pm?.currentSession
      if (!pm || !session || session.resolved) return world
      const motion = session.motions[action.motionIndex]
      if (!motion) return world
      const motions = session.motions.map((entry, index) =>
        index === action.motionIndex ? { ...entry, playerVote: action.vote } : entry,
      )
      return {
        ...world,
        politicianMode: {
          ...pm,
          currentSession: { ...session, motions },
        },
      }
    }

    case 'RESOLVE_SESSION':
      return resolveCouncilSession(world)

    case 'PROMOTE_TO_COMMITTEE_CHAIR':
      return promoteToCommitteeChair(world)

    case 'LAUNCH_LEADERSHIP_CHALLENGE':
      return launchLeadershipChallenge(world)

    case 'FORM_GOVERNMENT':
      return resolveGovernmentFormation(
        world,
        action.kind,
        action.leadPartyId,
        action.partnerIds ?? [],
      )

    case 'SUBMIT_PACT':
      return submitPactProposal(world, action.proposal)

    case 'ACCEPT_NPC_PROPOSAL':
      return acceptNpcProposal(world)

    case 'WITHDRAW_COMMITMENT':
      return withdrawCommitment(world, action.pactId, action.commitmentId)

    case 'BREAK_PACT':
      return breakPact(world, action.pactId)

    case 'QUEUE_MOTION':
      return queueCustomMotion(world, action.input)

    case 'QUEUE_REPEAL':
      return queueRepealMotion(world, action.enactmentId)

    case 'PROPOSE_BUDGET': {
      const pm = world.politicianMode
      if (!pm || !canProposeBudget(world)) return world
      const budget = normalizeBudget(action.budget)
      return {
        ...world,
        politicianMode: { ...pm, proposedBudget: budget },
        newsFeed: [`Week ${world.week}: Government tables its budget draft.`, ...world.newsFeed].slice(0, 30),
      }
    }

    case 'ACKNOWLEDGE_VICTORY': {
      if (!world.victory || world.victory.victoryScreenSeen) return world
      return { ...world, victory: { ...world.victory, victoryScreenSeen: true } }
    }

    case 'LOBBY_COUNCILLOR':
      return lobbyCouncillor(world, action.councillorId, action.motionId, action.desiredVote).world

    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
