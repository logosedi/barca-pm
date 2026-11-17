import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Passwords: scrypt from node:crypto (memory-hard, no native dependency to compile).
// Stored as `scrypt$N$r$p$salt$hash` so the cost can be raised without a migration.
const SCRYPT = { N: 32768, r: 8, p: 1, keyLength: 64 };

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N, r, p, maxmem: 128 * N * r * 2 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keyLength);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null) {
  // Hash even when there is nothing to compare with, so a missing account takes as long
  // as a wrong password.
  const [scheme, N, r, p, salt, hash] = (stored ?? DUMMY_HASH).split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), Number(N), Number(r), Number(p), expected.length);
  return timingSafeEqual(actual, expected) && stored !== null;
}

const DUMMY_HASH = ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, Buffer.alloc(16).toString("base64"), Buffer.alloc(64).toString("base64")].join("$");

/** Random secret for sessions, invites and API tokens. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Secrets are high-entropy, so a plain SHA-256 is enough to store them safely. */
export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
