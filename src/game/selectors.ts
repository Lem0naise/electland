import { electedSeatCounts as electedSeatCountsFromSim } from '../lib/sim'
import type { PartyDefinition, World } from '../types/world'

export { getActivePolicies, getRepealablePolicies } from '../sim/council/legislation'
export { isPlayerMayor } from '../sim/politics/career'
export {
  governmentLeadParty,
  isPlayerPartyGovernmentLead,
  isPlayerPartyInGovernment,
} from '../sim/politics/government'
export { getPlayerPacts } from '../sim/politics/pacts'

export function playerParty(world: World): PartyDefinition | undefined {
  return world.parties.find((party) => party.id === world.playerPartyId)
}

export function electedSeatCounts(world: World): Record<string, number> {
  return electedSeatCountsFromSim(world)
}

export function shouldShowVictoryModal(world: World): boolean {
  return Boolean(
    world.victory
    && world.victory.mayorFirstAchievedWeek != null
    && !world.victory.victoryScreenSeen,
  )
}

export function canPlayerVote(world: World): boolean {
  const pm = world.politicianMode
  if (!pm?.politician.isIncumbent) return false
  const session = pm.currentSession
  if (!session || session.resolved) return false
  return session.motions.some(
    (motion) => motion.playerVote == null && motion.status !== 'passed' && motion.status !== 'failed',
  )
}
