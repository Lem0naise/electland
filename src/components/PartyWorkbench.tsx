import { useMemo, useState } from 'react'

import type { CustomPartyDraft, PartyDefinition, PoliticalValues } from '../types/sim'

interface PartyWorkbenchProps {
  customParties: CustomPartyDraft[]
  parties: PartyDefinition[]
  playerPartyId: string
  showPlayerPicker?: boolean
  onCreateParty: (party: CustomPartyDraft) => void
  onRemoveParty: (name: string) => void
  onSelectPlayerParty: (partyId: string) => void
}

const defaultValues: PoliticalValues = {
  change: 0,
  growth: 0,
  services: 0,
}

export function PartyWorkbench({
  customParties,
  parties,
  playerPartyId,
  showPlayerPicker = true,
  onCreateParty,
  onRemoveParty,
  onSelectPlayerParty,
}: PartyWorkbenchProps) {
  const [draft, setDraft] = useState<CustomPartyDraft>({
    name: '',
    leader: '',
    colour: '#7c2d12',
    values: defaultValues,
  })

  const axes = useMemo(() => Object.keys(defaultValues) as Array<keyof PoliticalValues>, [])

  return (
    <section className="panel party-panel">
      <div className="panel-kicker">Party Setup</div>
      <h3>Pick Your Party</h3>
      <p className="ward-mood">Choose which party you play as — you start as the underdog. Or create a brand new one.</p>

      {showPlayerPicker && (
        <div className="party-selector">
          {parties.length > 0 ? (
            parties.map((party) => (
              <label key={party.id} className={`party-chip${party.id === playerPartyId ? ' is-active' : ''}`}>
                <input
                  type="radio"
                  name="player-party"
                  checked={party.id === playerPartyId}
                  onChange={() => onSelectPlayerParty(party.id)}
                />
                <span className="swatch" style={{ backgroundColor: party.colour }} />
                <span>
                  <strong>{party.name}</strong>
                  <small>{party.leader}</small>
                </span>
              </label>
            ))
          ) : (
            <p className="ward-mood">Generate a town first to see the local parties.</p>
          )}
        </div>
      )}

      <form
        className="party-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.name.trim() || !draft.leader.trim()) return
          onCreateParty({
            ...draft,
            name: draft.name.trim(),
            leader: draft.leader.trim(),
          })
          setDraft({
            name: '',
            leader: '',
            colour: '#7c2d12',
            values: defaultValues,
          })
        }}
      >
        <div className="form-row">
          <label>
            <span>Party name</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            <span>Leader</span>
            <input value={draft.leader} onChange={(event) => setDraft({ ...draft, leader: event.target.value })} />
          </label>
          <label>
            <span>Colour</span>
            <input type="color" value={draft.colour} onChange={(event) => setDraft({ ...draft, colour: event.target.value })} />
          </label>
        </div>

        <div className="axis-grid">
          {axes.map((axis) => (
            <label key={axis}>
              <span>{axis.replace('_', ' ')}</span>
              <input
                type="range"
                min={-100}
                max={100}
                value={draft.values[axis]}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setDraft({
                    ...draft,
                    values: {
                      ...draft.values,
                      [axis]: value,
                    },
                  })
                }}
              />
              <strong>{draft.values[axis]}</strong>
            </label>
          ))}
        </div>

        <button type="submit" className="ink-button">Add to Ballot</button>
      </form>

      {customParties.length > 0 && (
        <div className="custom-party-list">
          <h4>Custom Parties</h4>
          {customParties.map((party) => (
            <div key={`${party.name}-${party.leader}`} className="custom-party-item">
              <span className="swatch" style={{ backgroundColor: party.colour }} />
              <div>
                <strong>{party.name}</strong>
                <small>{party.leader}</small>
              </div>
              <button type="button" onClick={() => onRemoveParty(party.name)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
