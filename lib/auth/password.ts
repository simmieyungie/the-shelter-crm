import "server-only";
import { hash, verify } from "@node-rs/argon2";

const OPTIONS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}
