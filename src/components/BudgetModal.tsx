import { useMemo, useState } from 'react'
import type { Budget, BudgetCategory } from '../types/sim'

function withFunding(categories: BudgetCategory[], fundingById: Record<string, number>): BudgetCategory[] {
  return categories.map((category) => ({ ...category, funding: fundingById[category.id] ?? category.funding }))
}

function autoBalanceCategories(categories: BudgetCategory[], totalBudget: number): BudgetCategory[] {
  const current = categories.reduce((sum, category) => sum + category.funding, 0)
  const delta = totalBudget - current
  if (delta === 0 || categories.length === 0) return categories.map((category) => ({ ...category }))
  const next = categories.map((category) => ({ ...category }))
  let remaining = delta
  let guard = 0
  while (remaining !== 0 && guard < 500) {
    const index = guard % next.length
    if (remaining > 0) {
      next[index].funding = Math.min(100, next[index].funding + 1)
      remaining -= 1
    } else if (next[index].funding > 0) {
      next[index].funding -= 1
      remaining += 1
    }
    guard += 1
  }
  return next
}

export function BudgetModal({ budget, onSave, onClose, saveLabel = 'Approve Budget' }: {
  budget: Budget
  onSave: (b: Budget) => void
  onClose: () => void
  saveLabel?: string
}) {
  const budgetKey = useMemo(() => JSON.stringify(budget.categories.map((c) => [c.id, c.funding])), [budget])
  const [cats, setCats] = useState(budget.categories.map((c) => ({ ...c })))
  const [prevKey, setPrevKey] = useState(budgetKey)
  if (prevKey !== budgetKey) {
    setPrevKey(budgetKey)
    setCats(budget.categories.map((c) => ({ ...c })))
  }
  const currentTotal = cats.reduce((s, c) => s + c.funding, 0)
  const delta = currentTotal - budget.totalBudget
  const balanced = Math.abs(delta) <= 2

  const update = (id: string, v: number) => {
    setCats((prev) => prev.map((c) => c.id === id ? { ...c, funding: v } : c))
  }

  const applyPreset = (kind: 'maintain' | 'services' | 'growth') => {
    const base = Object.fromEntries(budget.categories.map((category) => [category.id, 50]))
    if (kind === 'services') {
      base.libraries = 60
      base.safety = 60
      base.parks = 45
      base.roads = 35
    } else if (kind === 'growth') {
      base.roads = 65
      base.parks = 40
      base.libraries = 40
      base.safety = 55
    }
    setCats(autoBalanceCategories(withFunding(budget.categories, base), budget.totalBudget))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal budget-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-kicker">Council Chambers</span>
          <h2>Set the Budget</h2>
          <p className="modal-sub">
            Allocate funding across four service groups. Total budget: {budget.totalBudget} units.{' '}
            <strong>You must balance the books.</strong>
          </p>
          <p className="modal-sub budget-whip-hint">
            Governing parties will whip Aye; opposition support depends on this mix.
          </p>
        </div>

        <div className="budget-presets">
          <button type="button" className="ink-button secondary" onClick={() => applyPreset('maintain')}>Maintain</button>
          <button type="button" className="ink-button secondary" onClick={() => applyPreset('services')}>Services-heavy</button>
          <button type="button" className="ink-button secondary" onClick={() => applyPreset('growth')}>Growth-heavy</button>
          <button type="button" className="ink-button secondary" onClick={() => setCats(autoBalanceCategories(cats, budget.totalBudget))}>Auto-balance</button>
        </div>

        <div className="budget-categories">
          {cats.map((c) => (
            <div key={c.id} className="budget-row">
              <div className="budget-row-label">
                <span className="budget-cat-name">{c.label}</span>
                <span className="budget-cat-blocs">
                  {c.blocs.slice(0, 3).map((b) => (
                    <span key={b} className="budget-bloc-tag">{b.replace(/_/g, ' ')}</span>
                  ))}
                </span>
              </div>
              <div className="budget-row-controls">
                <button className="budget-adj-btn" type="button" onClick={() => update(c.id, Math.max(0, c.funding - 5))}>−5</button>
                <button className="budget-adj-btn" type="button" onClick={() => update(c.id, Math.max(0, c.funding - 1))}>−</button>
                <input type="range" min={0} max={100} value={c.funding} onChange={(e) => update(c.id, Number(e.target.value))} className="budget-slider" />
                <button className="budget-adj-btn" type="button" onClick={() => update(c.id, Math.min(100, c.funding + 1))}>+</button>
                <button className="budget-adj-btn" type="button" onClick={() => update(c.id, Math.min(100, c.funding + 5))}>+5</button>
                <span className="budget-value">{c.funding}</span>
              </div>
              <div className="budget-bar-wrap">
                <div className="budget-bar-fill" style={{ width: `${c.funding}%`, background: c.funding >= 60 ? 'var(--safe)' : c.funding >= 30 ? '#edae49' : 'var(--accent-red)' }} />
              </div>
            </div>
          ))}
        </div>

        <div className={`budget-summary${balanced ? ' is-balanced' : ' is-unbalanced'}`}>
          <span className="budget-summary-total">Allocated: {currentTotal} / {budget.totalBudget}</span>
          {!balanced && (
            <span className="budget-summary-delta">
              {delta > 0 ? `Over by ${delta} — cut spending somewhere.` : `Under by ${-delta} — you have room to spend.`}
            </span>
          )}
          {balanced && (
            <span className="budget-summary-delta balanced">Budget balanced.</span>
          )}
          <button
            className="ink-button"
            type="button"
            disabled={!balanced}
            onClick={() => onSave({ ...budget, categories: cats })}
          >
            {balanced ? saveLabel : 'Balance the books first'}
          </button>
        </div>
      </div>
    </div>
  )
}
