import { electedPartyIdForWard, electedSeatCounts } from '../lib/sim'
import type { World } from '../types/sim'

export function CouncilComposition({ world, onChangeWard }: { world: World; onChangeWard: () => void }) {
  const pm = world.politicianMode
  if (!pm) return null

  const majority = Math.floor(world.constituencies.length / 2) + 1
  const seatsByParty = new Map<string, number>(Object.entries(electedSeatCounts(world)))
  const leader = [...seatsByParty.entries()].sort((a, b) => b[1] - a[1])[0]
  const leadingParty = world.parties.find((party) => party.id === leader?.[0])
  const playerWard = world.constituencies.find((ward) => ward.id === pm.politician.wardId)
  const sortedWards = [...world.constituencies].sort((a, b) => {
    const partyA = electedPartyIdForWard(world, a.id) ?? ''
    const partyB = electedPartyIdForWard(world, b.id) ?? ''
    const seatDifference = (seatsByParty.get(partyB) ?? 0) - (seatsByParty.get(partyA) ?? 0)
    if (seatDifference !== 0) return seatDifference
    const nameA = world.parties.find((p) => p.id === partyA)?.name ?? partyA
    const nameB = world.parties.find((p) => p.id === partyB)?.name ?? partyB
    const partyDifference = nameA.localeCompare(nameB)
    return partyDifference !== 0 ? partyDifference : a.name.localeCompare(b.name)
  })

  return (
    <section className="council-composition" aria-label="Council composition">
      <div className="council-composition-head">
        <div>
          <div className="panel-kicker">Council makeup</div>
          <strong>{leadingParty?.name ?? 'No overall leader'} {leader && `${leader[1]}/${world.constituencies.length}`}</strong>
        </div>
        {!pm.politician.isIncumbent && (
          <button type="button" className="council-change-ward-btn" onClick={onChangeWard}>
            {playerWard ? 'Change ward' : 'Choose ward'}
          </button>
        )}
      </div>
      <div className="council-dots">
        {sortedWards.map((ward) => {
          const electedPartyId = electedPartyIdForWard(world, ward.id)
          const party = world.parties.find((entry) => entry.id === electedPartyId)
          const councillor = pm.councillors.find((entry) => entry.wardId === ward.id)
          const isPlayerWard = ward.id === pm.politician.wardId
          const name = isPlayerWard && pm.politician.isIncumbent
            ? pm.politician.name
            : councillor?.name
              ?? (world.electionsHeld >= 1
                ? world.electionNightResults.find((r) => r.wardId === ward.id)?.winner?.name
                : undefined)
              ?? 'Representative pending'
          const partyName = party?.name ?? 'Independent'
          return (
            <span
              key={ward.id}
              className={`council-dot${isPlayerWard ? ' council-dot--player' : ''}`}
              style={{ background: party?.colour ?? '#888' }}
              data-tooltip={`${name} · ${ward.name} · ${partyName}`}
              aria-label={`${ward.name}, ${name}, ${partyName}${isPlayerWard ? ', your ward' : ''}`}
            />
          )
        })}
      </div>
      <div className="council-composition-meta">
        {leader && leader[1] >= majority
          ? `${leadingParty?.name} holds a majority (${majority} needed).`
          : `${majority} seats needed for a majority.`}
        {playerWard && <span>Your ward: {playerWard.name}{pm.politician.isIncumbent ? ' · seated' : ' · candidate'}</span>}
      </div>
    </section>
  )
}
