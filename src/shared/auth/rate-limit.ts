interface Attempt {
  count: number
  resetAt: number
}

/** Small in-memory fixed-window limiter, enough for a single API instance. */
export function createRateLimiter(options: { max: number; windowMs: number }) {
  const attempts = new Map<string, Attempt>()

  return {
    isBlocked(key: string): boolean {
      const attempt = attempts.get(key)
      if (!attempt) return false
      if (attempt.resetAt < Date.now()) {
        attempts.delete(key)
        return false
      }
      return attempt.count >= options.max
    },
    hit(key: string) {
      const now = Date.now()
      const attempt = attempts.get(key)
      if (!attempt || attempt.resetAt < now) {
        attempts.set(key, { count: 1, resetAt: now + options.windowMs })
        return
      }
      attempt.count++
    },
    reset(key: string) {
      attempts.delete(key)
    },
  }
}
