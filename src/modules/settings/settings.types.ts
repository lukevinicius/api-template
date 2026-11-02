export interface Settings {
  feeRate: number // basis points, 1000 = 10%
  chipLimit: number // in cents
  updatedAt: Date
}

export interface UpdateSettingsPayload {
  feeRate?: number
  chipLimit?: number
}
