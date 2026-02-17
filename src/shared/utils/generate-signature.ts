import { env } from "@/shared/env";

export function generateSignature(payload: string): string {
  const hasher = new Bun.CryptoHasher("sha256", env.HASH_SECRET);
  hasher.update(payload);

  return hasher.digest("hex");
}
