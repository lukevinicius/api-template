export async function hashPassword(password: string): Promise<string> {
  // Bun uses argon2id by default
  return Bun.password.hash(password)
}

// Hash used to spend the same time verifying a password when the user does
// not exist, preventing username enumeration through response timing.
const dummyHash = await hashPassword('dummy-password-for-timing-safety')

export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const isMatch = await Bun.password.verify(password, hash ?? dummyHash)

  return Boolean(hash) && isMatch
}
