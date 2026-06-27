import { useState } from 'react'
import type { Budget } from '../types/sim'

export function BudgetModal({ budget, onSave, onClose }: {
  budget: Budget
  onSave: (b: Budget) => void
  onClose: () => void
}) {
  const [cats, setCats] = useState(budget.categories.map((c) => ({ ...c })))
  const currentTotal = cats.reduce((s, c) => s + c.funding, 0)
  const delta = currentTotal - budget.totalBudget
  const balanced = Math.abs(delta) <= 2

  const update = (id: string, v: number) => {
    setCats((prev) => prev.map((c) => c.id === id ? { ...c, funding: v } : c))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal budget-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-kicker">Council Chambers</span>
          <h2>Set the Budget</h2>
          <p className="modal-sub">
            Allocate funding across council services. Total budget: {budget.totalBudget} units.{' '}
            <strong>You must balance the books.</strong>
          </p>
        </div>

        <div className="budget-categories">
          {cats.map((c) => (
            <div key={c.id} className="budget-row">
              <div className="budget-row-label">
                <span className="budget-cat-name">{c.label}</span>
                <span className="budget-cat-blocs">
                  {c.blocs.map((b) => (
                    <span key={b} className="budget-bloc-tag">{b.replace(/_/g, ' ')}</span>
                  ))}
                </span>
              </div>
              <div className="budget-row-controls">
                <button
                  className="budget-adj-btn"
                  type="button"
                  onClick={() => update(c.id, Math.max(0, c.funding - 5))}
                >−5</button>
                <button
                  className="budget-adj-btn"
                  type="button"
                  onClick={() => update(c.id, Math.max(0, c.funding - 1))}
                >−</button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={c.funding}
                  onChange={(e) => update(c.id, Number(e.target.value))}
                  className="budget-slider"
                />
                <button
                  className="budget-adj-btn"
                  type="button"
                  onClick={() => update(c.id, Math.min(100, c.funding + 1))}
                >+</button>
                <button
                  className="budget-adj-btn"
                  type="button"
                  onClick={() => update(c.id, Math.min(100, c.funding + 5))}
                >+5</button>
                <span className="budget-value">{c.funding}</span>
              </div>
              <div className="budget-bar-wrap">
                <div className="budget-bar-fill" style={{ width: `${c.funding}%`, background: c.funding >= 60 ? '#1a5c2a' : c.funding >= 30 ? '#edae49' : 'var(--accent-red)' }} />
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
            {balanced ? 'Approve Budget' : 'Balance the books first'}
          </button>
        </div>
      </div>
    </div>
  )
}
