const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return formatter.format(amount)
}

export function parseCurrency(value: string): number {
  return Number(value.replace(/[^0-9.-]+/g, '')) || 0
}
