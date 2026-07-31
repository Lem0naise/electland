import { useState } from 'react'
import { ideologySummary } from '../lib/sim'
import type { PartyEdit, World } from '../types/sim'
import { IdeologyWidget } from './IdeologyWidget'

type SetupStep = 'landing' | 'town' | 'profile' | 'review'

interface NewGameDraft {
  selectedPartyId: string
  playerName: string
  partyEdits: Record<string, PartyEdit>
}

function initialEdits(world: World | null): Record<string, PartyEdit> {
  return Object.fromEntries((world?.parties ?? []).map((party) => [
    party.id,
    { id: party.id, name: party.name, leader: party.leader, colour: party.colour, values: party.values },
  ]))
}

export function SetupScreen({
  world,
  constituencyCount,
  onSetConstituencyCount,
  onGenerate,
  onStart,
  onClose,
  hasSaveGame,
  onLoad,
  onExport,
  onImport,
}: {
  world: World | null
  constituencyCount: number
  onSetConstituencyCount: (count: number) => void
  onGenerate: (partyEdits: PartyEdit[], playerPartyId?: string) => void
  onStart: (seed?: number, playerPartyId?: string, edits?: PartyEdit[], playerName?: string) => void
  onClose?: () => void
  hasSaveGame?: boolean
  onLoad?: () => void
  onExport?: () => void
  onImport?: () => void
}) {
  const [step, setStep] = useState<SetupStep>('landing')
  const [draft, setDraft] = useState<NewGameDraft>(() => ({
    selectedPartyId: world?.playerPartyId ?? '',
    playerName: '',
    partyEdits: initialEdits(world),
  }))
  const [draftSeed, setDraftSeed] = useState<number | undefined>(world?.seed)
  const parties = world?.parties ?? []
  const selectedParty = parties.find((party) => party.id === draft.selectedPartyId) ?? parties[0]
  const selectedEdit = selectedParty ? draft.partyEdits[selectedParty.id] : undefined
  const previewMatchesWardCount = world?.constituencies.length === constituencyCount
  const canContinueFromTown = Boolean(world) && previewMatchesWardCount

  if (world?.seed !== draftSeed) {
    setDraftSeed(world?.seed)
    setDraft((current) => ({
      ...current,
      selectedPartyId: parties.some((party) => party.id === current.selectedPartyId)
        ? current.selectedPartyId
        : world?.playerPartyId ?? parties[0]?.id ?? '',
      partyEdits: Object.fromEntries(parties.map((party) => [
        party.id,
        current.partyEdits[party.id] ?? { id: party.id, name: party.name, leader: party.leader, colour: party.colour, values: party.values },
      ])),
    }))
  }

  const steps: Array<{ id: SetupStep; label: string }> = [
    { id: 'landing', label: 'Welcome' },
    { id: 'town', label: 'Town' },
    { id: 'profile', label: 'Campaign' },
    { id: 'review', label: 'Review' },
  ]
  const activeIndex = steps.findIndex((entry) => entry.id === step)

  const updateDraft = (changes: Partial<NewGameDraft>) => setDraft((current) => ({ ...current, ...changes }))
  const updateSelectedEdit = (changes: Partial<PartyEdit>) => {
    if (!selectedParty) return
    setDraft((current) => ({
      ...current,
      partyEdits: {
        ...current.partyEdits,
        [selectedParty.id]: { ...current.partyEdits[selectedParty.id], ...changes },
      },
    }))
  }

  const generatePreview = () => {
    onGenerate(Object.values(draft.partyEdits), draft.selectedPartyId || undefined)
    setStep('profile')
  }

  const applyUKNames = () => {
    const presets = [
      { colour: '#0087DC', name: 'Local Conservatives', values: { change: -30, growth: 15, services: 25 } },
      { colour: '#E4003B', name: 'Labour', values: { change: 15, growth: 5, services: 35 } },
      { colour: '#FAA61A', name: 'Lib Dems', values: { change: 10, growth: 15, services: 20 } },
      { colour: '#02A95B', name: 'Green Party', values: { change: 40, growth: -35, services: 30 } },
      { colour: '#70147A', name: 'Reform UK', values: { change: -35, growth: 15, services: 15 } },
    ]
    const distance = (a: string, b: string) => {
      const left = parseInt(a.replace('#', ''), 16)
      const right = parseInt(b.replace('#', ''), 16)
      return ((left >> 16 & 255) - (right >> 16 & 255)) ** 2 + ((left >> 8 & 255) - (right >> 8 & 255)) ** 2 + ((left & 255) - (right & 255)) ** 2
    }
    setDraft((current) => ({
      ...current,
      partyEdits: Object.fromEntries(parties.map((party) => {
        const currentEdit = current.partyEdits[party.id]
        const preset = [...presets].sort((a, b) => distance(currentEdit.colour, a.colour) - distance(currentEdit.colour, b.colour))[0]
        return [party.id, preset && distance(currentEdit.colour, preset.colour) < 3600
          ? { ...currentEdit, name: preset.name, values: preset.values }
          : currentEdit]
      })),
    }))
  }

  const startGame = () => {
    if (!world || !selectedParty) return
    if (!previewMatchesWardCount) {
      setStep('town')
      return
    }
    onStart(
      world.seed,
      selectedParty.id,
      Object.values(draft.partyEdits),
      draft.playerName.trim() || undefined,
    )
  }

  const startNewGame = () => {
    setDraft((current) => ({ ...current, playerName: '', partyEdits: initialEdits(world) }))
    setStep('town')
  }

  return (
    <div className={`setup-screen${world ? ' is-modal' : ' is-splash'}`}>
      <div className="setup-bg" />
      <div className="setup-inner setup-wizard">
        <div className="setup-masthead">
          <div className="setup-rule" />
          <h1 className="setup-title">Electland</h1>
          <p className="setup-tagline">Build a town, choose your political path, and begin your campaign.</p>
          <div className="setup-rule" />
        </div>

        {step !== 'landing' && (
          <nav className="setup-stepper" aria-label="New game progress">
            {steps.slice(1).map((entry, index) => (
              <span key={entry.id} className={`setup-step${entry.id === step ? ' is-active' : ''}${activeIndex > index + 1 ? ' is-complete' : ''}`} aria-current={entry.id === step ? 'step' : undefined}>
                <b>{index + 1}</b>{entry.label}
              </span>
            ))}
          </nav>
        )}

        <section className="setup-wizard-panel">
          {step === 'landing' && (
            <>
              <div className="setup-section-label">Start your local political career</div>
              <h2 className="setup-step-title">Welcome to Electland</h2>
              <p className="setup-step-copy">Create a new town and campaign, or return to an existing game.</p>
              <div className="setup-actions setup-actions-row">
                <button type="button" className="setup-btn-primary" onClick={startNewGame}>New Game</button>
                {world && onClose && <button type="button" className="setup-btn-secondary" onClick={onClose}>Return to Game</button>}
                {hasSaveGame && onLoad && <button type="button" className="setup-btn-secondary" onClick={onLoad}>Load Saved Game</button>}
                {onImport && <button type="button" className="setup-btn-secondary" onClick={onImport}>Import Save</button>}
                {world && onExport && <button type="button" className="setup-btn-ghost" onClick={onExport}>Export Current Save</button>}
              </div>
            </>
          )}

          {step === 'town' && (
            <>
              <div className="setup-section-label">Step 1 · Town shape</div>
              <h2 className="setup-step-title">Choose your council</h2>
              <p className="setup-step-copy">Ward count determines the size and volatility of the council.</p>
              <div className="ward-count-buttons setup-ward-counts">
                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((count) => (
                  <button key={count} type="button" className={`ward-count-btn${constituencyCount === count ? ' is-active' : ''}`} onClick={() => onSetConstituencyCount(count)}>{count}</button>
                ))}
              </div>
              <p className="setup-hint">{constituencyCount <= 6 ? 'Small and volatile: every ward matters.' : constituencyCount <= 10 ? 'Balanced council: enough room for marginals and strongholds.' : 'Large council: more tactical opportunities and local variation.'}</p>
              {world && <div className="setup-town-card"><strong>{world.townName}</strong><span>{world.constituencies.length} wards · population {world.totalPopulation.toLocaleString('en-GB')}</span></div>}
              {world && !previewMatchesWardCount && <p className="setup-hint">Generate the town again to preview this ward count before continuing.</p>}
              <div className="setup-step-actions">
                <button type="button" className="setup-btn-ghost" onClick={() => setStep('landing')}>Back</button>
                <button type="button" className="setup-btn-primary" onClick={generatePreview}>Generate Town</button>
                {canContinueFromTown && <button type="button" className="setup-btn-secondary" onClick={() => setStep('profile')}>Use Current Preview</button>}
              </div>
            </>
          )}

          {step === 'profile' && (
            <>
              <div className="setup-section-label">Step 2 · Your campaign</div>
              <h2 className="setup-step-title">Build your political career</h2>
              <label className="setup-edit-field setup-profile-field">
                <span>Your name</span>
                <input className="setup-politician-name-input" value={draft.playerName} onChange={(event) => updateDraft({ playerName: event.target.value })} placeholder={selectedParty?.leader ?? 'Enter your councillor name'} />
                <small>You will choose where to stand later through the in-game nomination process.</small>
              </label>
              <div className="setup-section-label">Choose your party</div>
              <div className="setup-party-choice-grid">
                {parties.map((party) => {
                  const edit = draft.partyEdits[party.id]
                  return <button key={party.id} type="button" className={`setup-party-choice${party.id === selectedParty?.id ? ' is-active' : ''}`} onClick={() => updateDraft({ selectedPartyId: party.id })}>
                    <span className="setup-party-swatch" style={{ background: edit?.colour ?? party.colour }} />
                    <span><strong>{edit?.name ?? party.name}</strong><small>{ideologySummary(edit?.values ?? party.values)}</small></span>
                  </button>
                })}
              </div>
              {selectedParty && selectedEdit && (
                <div className="setup-party-edit setup-selected-party-edit">
                  <label className="setup-edit-field"><span>Party name</span><input value={selectedEdit.name} onChange={(event) => updateSelectedEdit({ name: event.target.value })} /></label>
                  <label className="setup-edit-field"><span>Leader</span><input value={selectedEdit.leader} onChange={(event) => updateSelectedEdit({ leader: event.target.value })} /></label>
                  <label className="setup-edit-field setup-edit-colour"><span>Colour</span><input type="color" value={selectedEdit.colour} onChange={(event) => updateSelectedEdit({ colour: event.target.value })} /></label>
                  <div className="setup-edit-ideology">
                    <span className="setup-edit-field-label">Ideology</span>
                    {(['change', 'growth', 'services'] as const).map((axis) => (
                      <label key={axis} className="setup-edit-field setup-edit-slider">
                        <span>{axis === 'change' ? 'Reform' : axis === 'growth' ? 'Business' : 'Services'}</span>
                        <input type="range" min={-100} max={100} value={selectedEdit.values?.[axis] ?? selectedParty.values[axis]} onChange={(event) => updateSelectedEdit({ values: { ...(selectedEdit.values ?? selectedParty.values), [axis]: Number(event.target.value) } })} />
                        <span className="slider-value">{selectedEdit.values?.[axis] ?? selectedParty.values[axis]}</span>
                      </label>
                    ))}
                  </div>
                  <IdeologyWidget values={selectedEdit.values ?? selectedParty.values} colour={selectedEdit.colour} />
                </div>
              )}
              <button type="button" className="setup-uk-names-btn" onClick={applyUKNames}>Use UK party names</button>
              <div className="setup-step-actions">
                <button type="button" className="setup-btn-ghost" onClick={() => setStep('town')}>Back</button>
                <button type="button" className="setup-btn-primary" disabled={!selectedParty} onClick={() => setStep('review')}>Review Campaign</button>
              </div>
            </>
          )}

          {step === 'review' && world && selectedParty && selectedEdit && (
            <>
              <div className="setup-section-label">Step 3 · Ready to begin</div>
              <h2 className="setup-step-title">Review your campaign</h2>
              <div className="setup-review-card">
                <strong>{world.townName} Town Council</strong>
                <span>{world.constituencies.length} wards · Local political career</span>
                <span><i style={{ background: selectedEdit.colour }} /> {selectedEdit.name}</span>
                <span>Candidate: {draft.playerName.trim() || selectedEdit.leader}</span>
              </div>
              <p className="setup-step-copy">Party and candidate choices can be changed later only where the game allows; start this campaign with the details above.</p>
              <div className="setup-step-actions">
                <button type="button" className="setup-btn-ghost" onClick={() => setStep('profile')}>Back</button>
                <button type="button" className="setup-btn-primary" disabled={!previewMatchesWardCount} onClick={startGame}>Start Campaign</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
