import type { World } from '../types/sim'
import { summariseWardPacts } from './sim'

function formatSignedPp(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}pp`
}

function seatWord(n: number): string {
  return n === 1 ? 'seat' : 'seats'
}

export function formatElectionNightReport(world: World): string {
  const lines: string[] = []
  const majority = world.stats.councilMajority
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const totalVotes = world.electionNightResults.reduce(
    (sum, result) => sum + result.results.reduce((inner, row) => inner + Math.round(row.votes), 0),
    0,
  )

  const electionSeatCounts: Record<string, number> = {}
  for (const result of world.electionNightResults) {
    const id = result.winner?.partyId
    if (id) electionSeatCounts[id] = (electionSeatCounts[id] ?? 0) + 1
  }
  const playerElectionSeats = electionSeatCounts[world.playerPartyId] ?? 0
  const winnerPartyId = Object.entries(electionSeatCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const winnerParty = world.parties.find((p) => p.id === winnerPartyId)
  const playerWonThisElection = playerElectionSeats >= majority
  const anyMajority = Object.values(electionSeatCounts).some((seats) => seats >= majority)

  const prevSeats = world.electionNightPreviousSeats
  const allParties = world.parties
    .filter((p) => (electionSeatCounts[p.id] ?? 0) > 0 || (prevSeats[p.id] ?? 0) > 0)
    .sort((a, b) => (electionSeatCounts[b.id] ?? 0) - (electionSeatCounts[a.id] ?? 0))

  lines.push(`${world.townName} Council — Week ${world.week} Election Results`)
  lines.push('='.repeat(50))
  lines.push('')

  lines.push('RESULTS BY WARD')
  lines.push('-'.repeat(50))
  for (const result of world.electionNightResults) {
    const winnerName = result.winner?.name ?? '?'
    const winnerPartyName = result.winner?.partyName ?? '?'
    const winnerShare = result.results[0]
    const winnerVotes = winnerShare
      ? `${winnerShare.voteShare.toFixed(1)}% (${Math.round(winnerShare.votes).toLocaleString('en-GB')} votes)`
      : ''

    lines.push(result.wardName)
    lines.push(
      winnerVotes
        ? `  Winner: ${winnerPartyName} — ${winnerName}, ${winnerVotes}`
        : `  Winner: ${winnerPartyName} — ${winnerName}`,
    )

    if (result.swingFromLastElection != null) {
      lines.push(`  Winner swing vs last election: ${formatSignedPp(result.swingFromLastElection)}`)
    }

    lines.push(`  Turnout: ${(result.turnout * 100).toFixed(1)}%`)
    lines.push('  Candidates:')
    for (const row of result.results) {
      const candidate = result.candidates.find((cand) => cand.partyId === row.partyId)
      const name = candidate?.name ?? '?'
      lines.push(
        `    ${row.partyName} — ${name}: ${row.voteShare.toFixed(1)}% (${Math.round(row.votes).toLocaleString('en-GB')})`,
      )
    }

    for (const pact of summariseWardPacts(world, result.wardId)) {
      lines.push(`  Stand-down: ${pact.standingDownPartyName} standing down here for ${pact.beneficiaryPartyName}`)
    }

    if (result.wasHeld) {
      if (result.winner?.partyId === world.playerPartyId) {
        lines.push(`  Seat change: GAIN from ${result.previousWinnerPartyName ?? '?'}`)
      } else if (result.previousWinnerPartyId === world.playerPartyId) {
        lines.push(`  Seat change: LOSS to ${result.winner?.partyName ?? '?'}`)
      } else {
        lines.push(`  Seat change: FLIP: ${result.previousWinnerPartyName ?? '?'} → ${result.winner?.partyName ?? '?'}`)
      }
    }

    lines.push('')
  }

  lines.push('')
  lines.push('COUNCIL SEATS')
  lines.push('-'.repeat(50))
  if (world.electionsHeld > 1) {
    lines.push('Before → After:')
    for (const party of allParties) {
      const before = prevSeats[party.id] ?? 0
      const after = electionSeatCounts[party.id] ?? 0
      const delta = after - before
      const deltaStr = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : ''
      lines.push(`  ${party.name}: ${before} → ${after}${deltaStr}`)
    }
  } else {
    for (const party of world.parties) {
      const seats = electionSeatCounts[party.id] ?? 0
      if (seats === 0) continue
      lines.push(`  ${party.name}: ${seats} ${seatWord(seats)}`)
    }
  }
  lines.push(`  Majority: ${majority} seats`)
  lines.push(`  Turnout: ${(world.stats.averageTurnout * 100).toFixed(1)}%`)
  lines.push(`  Total votes: ${totalVotes.toLocaleString('en-GB')}`)

  lines.push('')
  lines.push('VERDICT')
  lines.push('-'.repeat(50))
  if (playerWonThisElection) {
    lines.push(
      `${playerParty?.name ?? 'Your party'} wins the council with ${playerElectionSeats} ${seatWord(playerElectionSeats)} — a majority of ${majority}.`,
    )
  } else if (!anyMajority) {
    lines.push('No Overall Control (NOC)')
    lines.push(
      `${winnerParty?.name ?? 'Largest party'} is the largest party with ${electionSeatCounts[winnerPartyId ?? ''] ?? 0} seats (${majority} needed).`,
    )
    lines.push(`${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} ${seatWord(playerElectionSeats)}.`)
  } else if (winnerParty && winnerParty.id !== world.playerPartyId) {
    lines.push(
      `${winnerParty.name} wins the council with ${electionSeatCounts[winnerParty.id] ?? 0} seats — a majority of ${majority}.`,
    )
    lines.push(`${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} ${seatWord(playerElectionSeats)}.`)
  } else {
    lines.push(`No majority. ${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} of ${majority} needed.`)
  }

  return lines.join('\n')
}
