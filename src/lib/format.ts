export function formatAxis(n: number): string {
  return String(Math.round(n))
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

export function formatSignedInt(n: number): string {
  const rounded = Math.round(n)
  return `${rounded > 0 ? '+' : ''}${rounded}`
}
