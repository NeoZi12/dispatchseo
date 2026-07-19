import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// App-level encryption for secrets stored at rest - right now the per-project
// DataForSEO API password. AES-256-GCM (authenticated, so tampering fails
// loudly on decrypt). Server-only by usage: node:crypto can't run in the
// browser, and the only importers are the connect action and credsForProject.
//
// The key is derived from DATAFORSEO_ENC_KEY via SHA-256, so any sufficiently
// random string works as the env value - generate one with
//   openssl rand -base64 32
// Set it in Vercel (Production + Preview). It is NOT needed in the GitHub
// Actions pipeline - those workflows use their own DATAFORSEO_LOGIN /
// DATAFORSEO_PASSWORD repo secrets and never read the encrypted DB column.
//
// Stored format: "enc:v1:<iv_b64>:<tag_b64>:<data_b64>". Anything without the
// "enc:v1:" prefix is treated as legacy plaintext and returned untouched, so
// rows written before encryption keep working until the owner reconnects (which
// re-saves them encrypted).

const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.DATAFORSEO_ENC_KEY;
  if (!raw) throw new Error("Missing DATAFORSEO_ENC_KEY");
  return createHash("sha256").update(raw).digest(); // always 32 bytes
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, data].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value; // legacy plaintext, pre-encryption
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const data = Buffer.from(dataB64, "base64");
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
