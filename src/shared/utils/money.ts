export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

/** Fee rates are stored in basis points (1000 = 10%). */
export function formatRate(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString('pt-BR')}%`
}
