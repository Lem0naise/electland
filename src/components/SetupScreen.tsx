import { useEffect, useState } from 'react'
import { ideologySummary } from '../lib/sim'
import type { PartyEdit, World } from '../types/sim'
import { IdeologyWidget } from './IdeologyWidget'

export function SetupScreen({
  world,
  constituencyCount,
  onSetConstituencyCount,
  onGenerate,
  onStart,
  onSavePartyEdit,
  onClose,
}: {
  world: World | null
  constituencyCount: number
  onSetConstituencyCount: (n: number) => void
  onGenerate: () => void
  onStart: (seed?: number, playerPartyId?: string) => void
  onSavePartyEdit: (edit: PartyEdit) => void
  onClose?: () => void
}) {
  const isFirstTime = world === null
  const [selectedPartyId, setSelectedPartyId] = useState<string>(world?.playerPartyId ?? '')
  const [expandedPartyId, setExpandedPartyId] = useState<string | null>(null)
  const [partyEdits, setPartyEdits] = useState<Record<string, PartyEdit>>(() => {
    if (!world) return {}
    return Object.fromEntries(world.parties.map((p) => [p.id, { id: p.id, name: p.name, leader: p.leader, colour: p.colour }]))
  })

  const worldRef = world
  useEffect(() => {
    if (!worldRef) {
      setPartyEdits({})
      setSelectedPartyId('')
      return
    }
    setPartyEdits(Object.fromEntries(
      worldRef.parties.map((p) => [p.id, { id: p.id, name: p.name, leader: p.leader, colour: p.colour }])
    ))
    setSelectedPartyId(worldRef.playerPartyId)
  }, [worldRef?.seed])

  const parties = world?.parties ?? []
  const majorParties = parties.filter((p) => p.tier === 'major' || p.tier === 'custom')
  const minorParties = parties.filter((p) => p.tier === 'minor')

  function editFor(partyId: string): PartyEdit {
    return partyEdits[partyId] ?? { id: partyId, name: '', leader: '', colour: '#888888' }
  }

  function updateEdit(partyId: string, changes: Partial<PartyEdit>) {
    setPartyEdits((prev) => ({ ...prev, [partyId]: { ...prev[partyId], ...changes } }))
  }

  function saveEdit(partyId: string) {
    const edit = partyEdits[partyId]
    if (edit) onSavePartyEdit(edit)
  }

  function handleStart() {
    Object.values(partyEdits).forEach((edit) => onSavePartyEdit(edit))
    onStart(world?.seed, selectedPartyId || world?.playerPartyId)
  }

  function handleNewTown() {
    onGenerate()
  }

  function applyUKNames() {
    if (!world) return
    const ukColourNames: Array<{ colour: string; name: string }> = [
      { colour: '#0087DC', name: 'Local Conservatives' },
      { colour: '#E4003B', name: 'Labour' },
      { colour: '#FAA61A', name: 'Lib Dems' },
      { colour: '#02A95B', name: 'Green Party' },
      { colour: '#70147A', name: 'Reform UK' },
    ]

    function hexDist(a: string, b: string) {
      const pa = parseInt(a.replace('#', ''), 16)
      const pb = parseInt(b.replace('#', ''), 16)
      const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255)
      const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255)
      const db = (pa & 255) - (pb & 255)
      return dr * dr + dg * dg + db * db
    }

    const nextEdits = { ...partyEdits }
    for (const party of world.parties) {
      let best: { name: string; dist: number } | null = null
      for (const uk of ukColourNames) {
        const dist = hexDist(party.colour, uk.colour)
        if (!best || dist < best.dist) {
          best = { name: uk.name, dist }
        }
      }
      if (best && best.dist < 3600) {
        nextEdits[party.id] = { ...editFor(party.id), name: best.name }
      }
    }
    setPartyEdits(nextEdits)
    for (const edit of Object.values(nextEdits)) {
      onSavePartyEdit(edit)
    }
  }

  const wardCounts = [5, 6, 7, 8, 9, 10, 11, 12]

  return (
    <div className={`setup-screen${isFirstTime ? ' is-splash' : ' is-modal'}`}>
      <div className="setup-bg" />

      <div className="setup-inner">
        <div className="setup-masthead">
          <div className="setup-rule" />
          <h1 className="setup-title">Electland</h1>
          <p className="setup-tagline">A tiny English town. A local election. Can you take the council?</p>
          <div className="setup-rule" />
        </div>

        <div className="setup-body">
          <div className="setup-config">
            <div className="setup-section">
              <div className="setup-section-label">Number of wards</div>
              <div className="ward-count-buttons">
                {wardCounts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ward-count-btn${constituencyCount === n ? ' is-active' : ''}`}
                    onClick={() => onSetConstituencyCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="setup-hint">
                {constituencyCount <= 6 ? 'Big wards - fragmented vote, landslides possible' : constituencyCount <= 9 ? 'Classic - balanced, with reasonable margins.' : 'Lots of wards - harder to manage, but clearer strongholds.'}
              </p>
            </div>

            {world && (
              <div className="setup-section">
                <div className="setup-section-label">Current town</div>
                <div className="setup-town-card">
                  <strong>{world.townName}</strong>
                  <span>{world.constituencies.length} wards · pop. {world.totalPopulation.toLocaleString('en-GB')} · week {world.week}</span>
                </div>
              </div>
            )}

            <div className="setup-actions">
              <button className="setup-btn-secondary" type="button" onClick={handleNewTown}>
                {world ? 'New Town' : 'Generate Town'}
              </button>
              {world && (
                <button className="setup-btn-primary" type="button" onClick={handleStart}>
                  Start Race
                </button>
              )}
              {!isFirstTime && onClose && (
                <button className="setup-btn-ghost" type="button" onClick={onClose}>
                  Cancel — back to game
                </button>
              )}
            </div>
          </div>

          <div className="setup-parties">
            <div className="setup-section-label">
              {parties.length === 0 ? 'Generate a town to see the parties' : 'Choose your party — click to select, expand to edit'}
            </div>

            {parties.length > 0 && (
              <>
                <div className="setup-party-group">
                  {majorParties.map((party) => {
                    const edit = editFor(party.id)
                    const isSelected = selectedPartyId === party.id || (!selectedPartyId && party.id === world?.playerPartyId)
                    const isExpanded = expandedPartyId === party.id
                    return (
                      <div
                        key={party.id}
                        className={`setup-party-card${isSelected ? ' is-selected' : ''}${isExpanded ? ' is-expanded' : ''}`}
                      >
                        <button
                          type="button"
                          className="setup-party-header"
                          onClick={() => {
                            setSelectedPartyId(party.id)
                            setExpandedPartyId(isExpanded ? null : party.id)
                          }}
                        >
                           <span className="setup-party-swatch" style={{ background: edit.colour }} />
                          <div className="setup-party-info">
                            <span className="setup-party-name">{edit.name}</span>
                            <span className="setup-party-leader">{edit.leader}</span>
                            <span className="setup-party-ideology">{ideologySummary(party.values)}</span>
                          </div>
                          <div className="setup-party-meta">
                            <span className="setup-party-tier">Major</span>
                            {isSelected && <span className="setup-party-playing">YOU</span>}
                          </div>
                          <span className="setup-party-expand">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                        </button>

                        <div className="setup-party-ideology-bar">
                          <IdeologyWidget values={party.values} colour={edit.colour} compact />
                        </div>

                        {isExpanded && (
                          <div className="setup-party-edit">
                            <label className="setup-edit-field">
                              <span>Party name</span>
                              <input
                                value={edit.name}
                                onChange={(e) => updateEdit(party.id, { name: e.target.value })}
                                onBlur={() => saveEdit(party.id)}
                                placeholder={party.name}
                              />
                            </label>
                            <label className="setup-edit-field">
                              <span>Leader</span>
                              <input
                                value={edit.leader}
                                onChange={(e) => updateEdit(party.id, { leader: e.target.value })}
                                onBlur={() => saveEdit(party.id)}
                                placeholder={party.leader}
                              />
                            </label>
                            <label className="setup-edit-field setup-edit-colour">
                              <span>Colour</span>
                              <input
                                type="color"
                                value={edit.colour}
                                onChange={(e) => {
                                  updateEdit(party.id, { colour: e.target.value })
                                  onSavePartyEdit({ ...edit, colour: e.target.value })
                                }}
                              />
                              <span className="colour-preview" style={{ background: edit.colour }} />
                            </label>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {minorParties.length > 0 && (
                  <div className="setup-minor-group">
                    <div className="setup-minor-label">Minor parties</div>
                    <div className="setup-party-group minor">
                      {minorParties.map((party) => {
                        const edit = editFor(party.id)
                        const isSelected = selectedPartyId === party.id
                        const isExpanded = expandedPartyId === party.id
                        return (
                          <div
                            key={party.id}
                            className={`setup-party-card is-minor${isSelected ? ' is-selected' : ''}${isExpanded ? ' is-expanded' : ''}`}
                          >
                            <button
                              type="button"
                              className="setup-party-header"
                              onClick={() => {
                                setSelectedPartyId(party.id)
                                setExpandedPartyId(isExpanded ? null : party.id)
                              }}
                            >
                              <span className="setup-party-swatch" style={{ background: edit.colour }} />
                              <div className="setup-party-info">
                                <span className="setup-party-name">{edit.name}</span>
                                <span className="setup-party-leader">{edit.leader}</span>
                                <span className="setup-party-ideology">{ideologySummary(party.values)}</span>
                              </div>
                              <div className="setup-party-meta">
                                <span className="setup-party-tier">Minor</span>
                                {isSelected && <span className="setup-party-playing">YOU</span>}
                              </div>
                              <span className="setup-party-expand">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                            </button>
                            <div className="setup-party-ideology-bar">
                              <IdeologyWidget values={party.values} colour={edit.colour} compact />
                            </div>
                            {isExpanded && (
                              <div className="setup-party-edit">
                                <label className="setup-edit-field">
                                  <span>Party name</span>
                                  <input
                                    value={edit.name}
                                    onChange={(e) => updateEdit(party.id, { name: e.target.value })}
                                    onBlur={() => saveEdit(party.id)}
                                  />
                                </label>
                                <label className="setup-edit-field">
                                  <span>Leader</span>
                                  <input
                                    value={edit.leader}
                                    onChange={(e) => updateEdit(party.id, { leader: e.target.value })}
                                    onBlur={() => saveEdit(party.id)}
                                  />
                                </label>
                                <label className="setup-edit-field setup-edit-colour">
                                  <span>Colour</span>
                                  <input
                                    type="color"
                                    value={edit.colour}
                                    onChange={(e) => {
                                      updateEdit(party.id, { colour: e.target.value })
                                      onSavePartyEdit({ ...edit, colour: e.target.value })
                                    }}
                                  />
                                  <span className="colour-preview" style={{ background: edit.colour }} />
                                </label>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {world && (
                  <button
                    type="button"
                    className="setup-uk-names-btn"
                    onClick={applyUKNames}
                    title="Rename parties to classic UK party names"
                  >
                    {'\uD83C\uDDEC\uD83C\uDDE7'} Use UK party names
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
