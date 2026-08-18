import { electedPartyIdForWard, electedSeatCounts } from '../lib/sim'
import type { World } from '../types/sim'

function isPartyInGovernment(world: World, partyId: string): boolean {
  const gov = world.government
  if (!gov || gov.status !== 'formed') return false
  return gov.leadPartyId === partyId || (gov.partnerPartyIds ?? []).includes(partyId)
}

export function CouncilComposition({ world, onChangeWard }: { world: World; onChangeWard: () => void }) {
  const pm = world.politicianMode
  if (!pm) return null

  const majority = Math.floor(world.constituencies.length / 2) + 1
  const seatsByParty = new Map<string, number>(Object.entries(electedSeatCounts(world)))
  const gov = world.government
  const govPartyIds = gov?.status === 'formed'
    ? [gov.leadPartyId, ...(gov.partnerPartyIds ?? [])]
    : []
  const govSeats = govPartyIds.reduce((sum, id) => sum + (seatsByParty.get(id) ?? 0), 0)
  const govLabel = govPartyIds.length > 0
    ? govPartyIds.map((id) => world.parties.find((p) => p.id === id)?.name ?? '?').join(' + ')
    : null
  const leader = [...seatsByParty.entries()].sort((a, b) => b[1] - a[1])[0]
  const leadingParty = world.parties.find((party) => party.id === leader?.[0])
  const playerWard = world.constituencies.find((ward) => ward.id === pm.politician.wardId)
  const sortedWards = [...world.constituencies].sort((a, b) => {
    const partyA = electedPartyIdForWard(world, a.id) ?? ''
    const partyB = electedPartyIdForWard(world, b.id) ?? ''
    const govA = isPartyInGovernment(world, partyA) ? 0 : 1
    const govB = isPartyInGovernment(world, partyB) ? 0 : 1
    if (govA !== govB) return govA - govB
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
          <strong>{govLabel ? `${govLabel} ${govSeats}/${world.constituencies.length}` : `${leadingParty?.name ?? 'No overall leader'} ${leader ? `${leader[1]}/${world.constituencies.length}` : ''}`}</strong>
        </div>
        {!pm.politician.isIncumbent && (
          <button type="button" className="ink-button secondary small" onClick={onChangeWard}>
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
          const inGov = electedPartyId ? isPartyInGovernment(world, electedPartyId) : false
          const name = isPlayerWard && pm.politician.isIncumbent
            ? pm.politician.name
            : councillor?.name
              ?? (world.electionsHeld >= 1
                ? world.electionNightResults.find((r) => r.wardId === ward.id)?.winner?.name
                : undefined)
              ?? 'Representative pending'
          const partyName = party?.name ?? 'Independent'
          const govTag = inGov ? ' · GOV' : ''
          return (
            <span
              key={ward.id}
              className={`council-dot${isPlayerWard ? ' council-dot--player' : ''}${inGov ? ' council-dot--gov' : ''}`}
              style={{ background: party?.colour ?? 'var(--ink-soft)' }}
              data-tooltip={`${name} · ${ward.name} · ${partyName}${govTag}`}
              aria-label={`${ward.name}, ${name}, ${partyName}${isPlayerWard ? ', your ward' : ''}${inGov ? ', government' : ''}`}
            />
          )
        })}
      </div>
      <div className="council-composition-meta">
        {govLabel
          ? govSeats >= majority
            ? `${govLabel} hold a majority (${majority} needed).`
            : `${govLabel} govern as a minority (${majority} needed for majority).`
          : leader && leader[1] >= majority
            ? `${leadingParty?.name} holds a majority (${majority} needed).`
            : `${majority} seats needed for a majority.`}
        {playerWard && <span>Your ward: {playerWard.name}{pm.politician.isIncumbent ? ' · seated' : ' · candidate'}</span>}
      </div>
    </section>
  )
}
