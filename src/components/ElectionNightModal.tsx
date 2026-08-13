import { formatElectionNightReport } from '../lib/formatElectionNightReport'
import type { World } from '../types/sim'

export function ElectionNightModal({ world, onReveal, onClose }: {
  world: World
  onReveal: () => void
  onClose: () => void
}) {
  const revealed = world.electionNightResults.slice(0, world.electionNightRevealIndex)
  const total = world.electionNightResults.length
  const done = world.electionNightRevealIndex >= total
  const playerParty = world.parties.find((p) => p.id === world.playerPartyId)
  const majority = world.stats.councilMajority

  const electionSeatCounts: Record<string, number> = {}
  world.electionNightResults.forEach((r) => {
    const id = r.winner?.partyId
    if (id) electionSeatCounts[id] = (electionSeatCounts[id] ?? 0) + 1
  })
  const playerElectionSeats = electionSeatCounts[world.playerPartyId] ?? 0
  const winnerPartyId = Object.entries(electionSeatCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const winnerParty = world.parties.find((p) => p.id === winnerPartyId)
  const playerWonThisElection = playerElectionSeats >= majority

  const gains = world.electionNightResults.filter((r) => r.wasHeld && r.winner?.partyId === world.playerPartyId)
  const losses = world.electionNightResults.filter((r) => r.wasHeld && r.previousWinnerPartyId === world.playerPartyId)
  const otherFlips = world.electionNightResults.filter(
    (r) => r.wasHeld && r.winner?.partyId !== world.playerPartyId && r.previousWinnerPartyId !== world.playerPartyId,
  )

  const prevSeats = world.electionNightPreviousSeats
  const allParties = world.parties.filter((p) =>
    (electionSeatCounts[p.id] ?? 0) > 0 || (prevSeats[p.id] ?? 0) > 0,
  ).sort((a, b) => (electionSeatCounts[b.id] ?? 0) - (electionSeatCounts[a.id] ?? 0))

  return (
    <div className="modal-backdrop">
      <div className="modal election-night-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-kicker">Election Night</span>
          <h2>{world.townName} Council</h2>
          <p className="modal-sub">Week {world.week} · {revealed.length} of {total} wards declared · {majority} seats for majority</p>
        </div>

        <div className="election-night-grid">
          {revealed.map((r) => {
            const isPlayer = r.winner?.partyId === world.playerPartyId
            const isGain = r.wasHeld && r.winner?.partyId === world.playerPartyId
            const isLoss = r.wasHeld && r.previousWinnerPartyId === world.playerPartyId
            const isFlip = r.wasHeld && !isGain && !isLoss
            const margin = r.results[0] && r.results[1] ? r.results[0].voteShare - r.results[1].voteShare : 0
            const marginVotes = r.results[0] && r.results[1] ? Math.round(r.results[0].votes - r.results[1].votes) : 0
            const isClose = margin < 3 || marginVotes <= 100
            const isPlayerWard = world.politicianMode?.politician.wardId === r.wardId
            return (
              <div
                key={r.wardId}
                className={[
                  'election-result-card',
                  isPlayer ? 'is-player' : '',
                  isGain ? 'is-gain' : '',
                  isLoss ? 'is-loss' : '',
                  isFlip ? 'is-flip' : '',
                  isClose ? 'is-close' : '',
                  isPlayerWard ? 'is-your-ward' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="result-card-ward">
                  {r.wardName}
                  {isPlayerWard && <span className="your-seat-label"> (YOUR SEAT)</span>}
                </div>
                {r.winner && (
                  <div className="result-card-winner" style={{ borderLeftColor: r.winner.partyColour }}>
                    <span className="result-candidate-initials" style={{ background: r.winner.partyColour }}>
                      {r.winner.initials}
                    </span>
                    <div className="result-winner-names">
                      <span className="result-candidate-name">{r.winner.name}</span>
                      <span className="result-party-name">{r.winner.partyName}</span>
                    </div>
                  </div>
                )}
                <div className="result-card-stats">
                  {r.results[0] && (
                    <span className="result-pct-row">
                      <strong className="result-pct">{r.results[0].voteShare.toFixed(1)}%</strong>
                      <span className="result-votes">({Math.round(r.results[0].votes).toLocaleString('en-GB')} votes)</span>
                      {r.results[1] && (
                        <span className="result-margin">+{margin.toFixed(1)} pts</span>
                      )}
                    </span>
                  )}
                  {r.swingFromLastElection != null && (
                    <span className={`result-swing ${r.swingFromLastElection >= 0 ? 'swing-up' : 'swing-down'}`}>
                      {r.swingFromLastElection >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(r.swingFromLastElection).toFixed(1)}pp swing
                    </span>
                  )}
                  <span className="result-turnout">
                    Turnout: {(r.turnout * 100).toFixed(1)}%
                  </span>
                </div>
                {r.results[1] && (
                  <div className="result-runnerup">
                    2nd: <span className="result-runnerup-party" style={{ color: r.results[1].colour }}>
                      {r.results[1].partyName}
                    </span>
                    {' — '}
                    <span className="result-runnerup-name">
                      {(() => {
                        const cand = r.candidates.find((c) => c.partyId === r.results[1].partyId)
                        return cand?.name ?? r.results[1].partyName
                      })()}
                    </span>
                    {' '}({Math.round(r.results[1].votes).toLocaleString('en-GB')} votes)
                  </div>
                )}
                {r.results[0] && r.results[1] && (
                  <div className="result-bar">
                    <div className="result-bar-fill" style={{ width: `${r.results[0].voteShare}%`, background: r.winner.partyColour }} />
                    <div className="result-bar-fill" style={{ width: `${r.results[1].voteShare}%`, background: r.results[1].colour }} />
                  </div>
                )}
                {isClose && (
                  <div className="result-close-banner">
                    {marginVotes === 0
                      ? '\u26A0 TIE - WON ON RECOUNT'
                      : `\u26A0 CALLED BY ${marginVotes.toLocaleString('en-GB')} VOTES`}
                  </div>
                )}
                {r.wasHeld && (
                  <div className="result-card-change">
                    {isGain && (
                      <span className="change-gain">
                        GAIN from {r.previousWinnerPartyName ?? '?'}
                        {r.previousMargin != null ? ` (was +${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    )}
                    {isLoss && (
                      <span className="change-loss">
                        LOSS to {r.winner?.partyName ?? '?'}
                        {r.previousMargin != null ? ` (overturned +${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    )}
                    {isFlip && (
                      <span className="change-flip">
                        FLIP: {r.previousWinnerPartyName ?? '?'} {'\u2192'} {r.winner?.partyName ?? '?'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {!done && (
            <button type="button" className="election-result-card pending-card" onClick={onReveal}>
              <div className="result-card-ward">Next declaration...</div>
              <div className="pending-reveal">Click to reveal</div>
            </button>
          )}
        </div>

        {done && (
          <div className="election-night-summary">

            {world.electionsHeld > 1 && (
              <div className="en-before-after">
                <div className="en-ba-label">Council: before {'\u2192'} after</div>
                <div className="en-ba-rows">
                  {allParties.map((p) => {
                    const before = prevSeats[p.id] ?? 0
                    const after = electionSeatCounts[p.id] ?? 0
                    const delta = after - before
                    return (
                      <div key={p.id} className={`en-ba-row${p.id === world.playerPartyId ? ' is-player' : ''}`}>
                        <span className="en-ba-swatch" style={{ background: p.colour }} />
                        <span className="en-ba-name">{p.name}</span>
                        <span className="en-ba-before">{before}</span>
                        <span className="en-ba-arrow">{'\u2192'}</span>
                        <span className="en-ba-after">{after}</span>
                        {delta !== 0 && (
                          <span className={`en-ba-delta ${delta > 0 ? 'up' : 'down'}`}>
                            {delta > 0 ? '+' : ''}{delta}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {(gains.length > 0 || losses.length > 0 || otherFlips.length > 0) && (
              <div className="en-flips">
                {gains.length > 0 && (
                  <div className="en-flips-section">
                    <span className="en-flips-label gain">Your gains</span>
                    {gains.map((r) => (
                      <span key={r.wardId} className="en-flip-pill gain">
                        {r.wardName} from {r.previousWinnerPartyName ?? '?'}
                        {r.previousMargin != null ? ` (+${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {losses.length > 0 && (
                  <div className="en-flips-section">
                    <span className="en-flips-label loss">Your losses</span>
                    {losses.map((r) => (
                      <span key={r.wardId} className="en-flip-pill loss">
                        {r.wardName} to {r.winner?.partyName ?? '?'}
                        {r.previousMargin != null ? ` (overturned +${r.previousMargin.toFixed(1)})` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {otherFlips.length > 0 && (
                  <div className="en-flips-section">
                    <span className="en-flips-label flip">Other upsets</span>
                    {otherFlips.map((r) => (
                      <span key={r.wardId} className="en-flip-pill flip">
                        {r.wardName}: {r.previousWinnerPartyName ?? '?'} {'\u2192'} {r.winner?.partyName ?? '?'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="night-standings">
              {world.parties
                .filter((p) => (electionSeatCounts[p.id] ?? 0) > 0 || p.id === world.playerPartyId)
                .sort((a, b) => (electionSeatCounts[b.id] ?? 0) - (electionSeatCounts[a.id] ?? 0))
                .map((p) => {
                  const seats = electionSeatCounts[p.id] ?? 0
                  const isPlayer = p.id === world.playerPartyId
                  const atMajority = seats >= majority
                  return (
                    <div key={p.id} className={`night-standing${isPlayer ? ' is-player' : ''}`}>
                      <span className="swatch" style={{ background: p.colour }} />
                      <span className="night-party-name">{p.name}</span>
                      <strong className="night-seats">{seats}</strong>
                      <span className="night-seats-label">seats</span>
                      {atMajority && <span className="majority-badge">MAJORITY</span>}
                    </div>
                  )
                })}
            </div>

            {(() => {
              const anyMajority = Object.values(electionSeatCounts).some((s) => s >= majority)
              const verdictClass = playerWonThisElection ? ' verdict-win' : anyMajority ? ' verdict-loss' : ' verdict-noc'
              const aveTurnout = (world.stats.averageTurnout * 100).toFixed(1)
              const totalVotes = world.electionNightResults.reduce((s, r) => s + r.results.reduce((ss, rr) => ss + rr.votes, 0), 0)
              return (
                <div className={`election-night-verdict${verdictClass}`}>
                  {playerWonThisElection
                    ? `${playerParty?.name ?? 'Your party'} wins the council with ${playerElectionSeats} seat${playerElectionSeats !== 1 ? 's' : ''} — a majority of ${majority}.`
                    : !anyMajority
                      ? `No Overall Control — ${winnerParty?.name ?? 'Largest party'} is the largest party with ${electionSeatCounts[winnerPartyId ?? ''] ?? 0} seats (${majority} needed for majority). ${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} seat${playerElectionSeats !== 1 ? 's' : ''}.`
                      : winnerParty && winnerParty.id !== world.playerPartyId
                        ? `${winnerParty.name} wins the council with ${electionSeatCounts[winnerParty.id] ?? 0} seats — a majority of ${majority}. ${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} seat${playerElectionSeats !== 1 ? 's' : ''}.`
                        : `A majority was reached. ${playerParty?.name ?? 'Your party'} won ${playerElectionSeats} of ${majority} needed.`}
                  <div className="en-verdict-stats">
                    Total votes cast: {totalVotes.toLocaleString('en-GB')} · Average turnout: {aveTurnout}%
                  </div>
                </div>
              )
            })()}

            <button
              className="ink-button secondary copy-results-btn"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(formatElectionNightReport(world)).catch(() => {})
              }}
            >
              {'\uD83D\uDCCB'} Copy all results
            </button>

            <button className="ink-button" type="button" onClick={onClose}>
              {playerWonThisElection
                ? 'Govern the town'
                : world.government?.status === 'forming'
                  ? (world.politicianMode && world.politicianMode.politician.careerRank !== 'party-leader'
                    ? 'See who forms government'
                    : 'Form Government')
                  : 'Campaign continues'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
