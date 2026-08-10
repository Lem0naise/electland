import { useState } from 'react'
import { suggestPacts } from '../lib/sim'
import type { CampaignAction, World } from '../types/sim'

export function WardPactNegotiator({
  world,
  focusWardId,
  onAction,
}: {
  world: World
  focusWardId: string
  onAction: (action: CampaignAction) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [alliancePartyId, setAlliancePartyId] = useState('')
  const [allianceMode, setAllianceMode] = useState<'theyForMe' | 'iForThem'>('theyForMe')
  const [checkedPairs, setCheckedPairs] = useState<Set<string>>(new Set())

  const ap = world.playerActionPoints
  const actionAvailable = ap >= 1
  const focusWard = world.constituencies.find((c) => c.id === focusWardId)
  const opponents = world.parties.filter((p) => p.id !== world.playerPartyId)

  function setPairChecked(key: string, checked: boolean) {
    setCheckedPairs((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function proposeAccepted(
    allyName: string,
    allyId: string,
    accepted: Array<{ ourWardId: string; theirWardId: string }>,
  ) {
    if (accepted.length === 0) return
    const first = accepted[0]
    const rest = accepted.slice(1).map((s) => ({ ourWardId: s.ourWardId, theirWardId: s.theirWardId }))
    onAction({
      type: 'propose_alliance',
      label: `Alliance with ${allyName}`,
      description: `Pact covering ${accepted.length} ward${accepted.length !== 1 ? 's' : ''}`,
      apCost: 1,
      targetPartyId: allyId,
      wardId: first.ourWardId,
      allyWardId: first.theirWardId,
      allianceEntries: rest,
    })
    setExpanded(false)
    setAlliancePartyId('')
    setCheckedPairs(new Set())
  }

  return (
    <section className={`panel ward-pact-panel${actionAvailable ? '' : ' is-disabled'}`}>
      <button
        type="button"
        className="ac-expand-toggle"
        onClick={() => setExpanded((s) => !s)}
        disabled={!actionAvailable}
      >
        <div className="ac-header">
          <span className="ac-name">Negotiate pacts</span>
          <span className={`ac-cost${actionAvailable ? '' : ' cant-afford'}`}>1 AP</span>
        </div>
        <span className="ac-desc">
          Propose stand-downs for {focusWard?.name ?? 'this ward'} — ask another party to stand down, or stand down for them.
        </span>
      </button>

      {expanded && actionAvailable && (
        <div className="ac-config">
          <div className="alliance-tabs">
            <button
              type="button"
              className={`alliance-tab${allianceMode === 'theyForMe' ? ' is-active' : ''}`}
              onClick={() => { setAllianceMode('theyForMe'); setCheckedPairs(new Set()) }}
            >
              They stand down here
            </button>
            <button
              type="button"
              className={`alliance-tab${allianceMode === 'iForThem' ? ' is-active' : ''}`}
              onClick={() => { setAllianceMode('iForThem'); setCheckedPairs(new Set()) }}
            >
              You stand down here
            </button>
          </div>

          {allianceMode === 'theyForMe' && (() => {
            const ally = world.parties.find((p) => p.id === alliancePartyId)
            const allSuggs = alliancePartyId ? suggestPacts(world, alliancePartyId, 0, Math.max(1, checkedPairs.size)) : []
            const suggs = allSuggs.filter((s) => s.theirWardId === focusWardId)
            const acceptCount = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept).length
            const allCheckedCount = checkedPairs.size

            return (
              <>
                <select
                  value={alliancePartyId}
                  onChange={(e) => { setAlliancePartyId(e.target.value); setCheckedPairs(new Set()) }}
                  className="ac-select"
                >
                  <option value="">Pick an ally...</option>
                  {opponents.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {alliancePartyId && ally && (
                  <div className="negotiation-card">
                    <div className="neg-header">
                      For <strong style={{ color: ally.colour }}>{ally.name}</strong> to stand down in{' '}
                      <strong>{focusWard?.name ?? 'this ward'}</strong>, you&apos;d need to stand down in:
                    </div>

                    {suggs.length === 0 ? (
                      <div className="neg-no-deal">
                        No deal — {ally.name} won&apos;t stand down in {focusWard?.name}.{' '}
                        {allSuggs.some((s) => s.ourWardId === focusWardId)
                          ? 'Try “You stand down here” — they might accept if you stand down in this ward.'
                          : ''}
                      </div>
                    ) : (
                      <>
                        <div className="neg-list">
                          {suggs.map((s) => {
                            const key = `${s.ourWardId}|${s.theirWardId}`
                            const isChecked = checkedPairs.has(key)
                            const ourBoost = s.ourWardPlayerShare * 0.01 * 25
                            return (
                              <div
                                key={key}
                                className={`neg-row${isChecked ? ' is-checked' : ''}${s.willAccept ? '' : ' is-rejected'}`}
                                onClick={() => setPairChecked(key, !isChecked)}
                              >
                                <span className="neg-chk" onClick={(e) => e.stopPropagation()}>
                                  <input type="checkbox" checked={isChecked} onChange={() => setPairChecked(key, !isChecked)} />
                                </span>
                                <span className="neg-ward">{s.ourWardName}</span>
                                <span className="neg-share">{s.ourWardPlayerShare.toFixed(1)}%</span>
                                <span className="neg-gain">~+{ourBoost.toFixed(1)}% for them</span>
                                <span className={`neg-accept${s.willAccept ? '' : ' is-reject'}`}>
                                  {s.willAccept ? `\u2713 ${s.acceptanceChance}%` : `\u2717 ${s.acceptanceChance}%`}
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        {allCheckedCount > 0 && (
                          <div className="neg-summary">
                            {acceptCount > 0 ? (
                              <>
                                <span style={{ color: 'var(--safe)', fontWeight: 700 }}>{acceptCount} of {allCheckedCount} will accept</span>
                                <button
                                  className="ink-button small"
                                  type="button"
                                  onClick={() => {
                                    const accepted = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept)
                                    proposeAccepted(ally.name, ally.id, accepted)
                                  }}
                                >
                                  Propose {acceptCount} deal{acceptCount !== 1 ? 's' : ''} (1 AP)
                                </button>
                              </>
                            ) : (
                              <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>NO DEAL — none of {allCheckedCount} will accept</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <button
                      className="ink-button secondary small"
                      type="button"
                      onClick={() => { setAlliancePartyId(''); setCheckedPairs(new Set()) }}
                    >
                      Back
                    </button>
                  </div>
                )}
              </>
            )
          })()}

          {allianceMode === 'iForThem' && (() => {
            const ally = world.parties.find((p) => p.id === alliancePartyId)
            const allSuggs = alliancePartyId ? suggestPacts(world, alliancePartyId, 0, Math.max(1, checkedPairs.size)) : []
            const suggs = allSuggs.filter((s) => s.ourWardId === focusWardId)
            const acceptCount = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept).length
            const allCheckedCount = checkedPairs.size

            return (
              <>
                <select
                  value={alliancePartyId}
                  onChange={(e) => { setAlliancePartyId(e.target.value); setCheckedPairs(new Set()) }}
                  className="ac-select"
                >
                  <option value="">Pick an ally...</option>
                  {opponents.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {alliancePartyId && ally && (
                  <div className="negotiation-card">
                    <div className="neg-header">
                      If you stand down in <strong>{focusWard?.name ?? 'this ward'}</strong>,{' '}
                      <strong style={{ color: ally.colour }}>{ally.name}</strong> could reciprocate in:
                    </div>

                    {suggs.length === 0 ? (
                      <div className="neg-no-deal">
                        No deal — standing down in {focusWard?.name} won&apos;t persuade {ally.name} to reciprocate.
                      </div>
                    ) : (
                      <>
                        <div className="neg-list">
                          {suggs.map((s) => {
                            const key = `${s.ourWardId}|${s.theirWardId}`
                            const isChecked = checkedPairs.has(key)
                            const theirBoost = s.theirWardAllyShare * 0.01 * 25
                            return (
                              <div
                                key={key}
                                className={`neg-row${isChecked ? ' is-checked' : ''}${s.willAccept ? '' : ' is-rejected'}`}
                                onClick={() => setPairChecked(key, !isChecked)}
                              >
                                <span className="neg-chk" onClick={(e) => e.stopPropagation()}>
                                  <input type="checkbox" checked={isChecked} onChange={() => setPairChecked(key, !isChecked)} />
                                </span>
                                <span className="neg-ward">{s.theirWardName}</span>
                                <span className="neg-share">{s.theirWardAllyShare.toFixed(1)}%</span>
                                <span className="neg-gain">~+{theirBoost.toFixed(1)}% for you</span>
                                <span className={`neg-accept${s.willAccept ? '' : ' is-reject'}`}>
                                  {s.willAccept ? `\u2713 ${s.acceptanceChance}%` : `\u2717 ${s.acceptanceChance}%`}
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        {allCheckedCount > 0 && (
                          <div className="neg-summary">
                            {acceptCount > 0 ? (
                              <>
                                <span style={{ color: 'var(--safe)', fontWeight: 700 }}>{acceptCount} of {allCheckedCount} will accept</span>
                                <button
                                  className="ink-button small"
                                  type="button"
                                  onClick={() => {
                                    const accepted = suggs.filter((s) => checkedPairs.has(`${s.ourWardId}|${s.theirWardId}`) && s.willAccept)
                                    proposeAccepted(ally.name, ally.id, accepted)
                                  }}
                                >
                                  Propose {acceptCount} deal{acceptCount !== 1 ? 's' : ''} (1 AP)
                                </button>
                              </>
                            ) : (
                              <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>NO DEAL — none of {allCheckedCount} will accept</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <button
                      className="ink-button secondary small"
                      type="button"
                      onClick={() => { setAlliancePartyId(''); setCheckedPairs(new Set()) }}
                    >
                      Back
                    </button>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </section>
  )
}
