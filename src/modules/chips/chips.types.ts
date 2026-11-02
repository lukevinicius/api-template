export interface CreateChipPayload {
  price: number // in cents
  quantity: number
  imageUrl?: string | null
}

// Quantity is not editable here, only through stock adjustments
export interface UpdateChipPayload {
  price?: number
  imageUrl?: string | null
}

export type StockOperation = 'add' | 'remove'

export interface Chip {
  id: string
  price: number // in cents
  quantity: number
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
}
