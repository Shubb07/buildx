import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env';

// Field-level encryption for the few values Sthiva must keep but never show in full: a seller's
// bank account number or UPI ID. AES-256-GCM with a key that lives only in the server's environment
// (PAYOUT_ENCRYPTION_KEY: 32 random bytes, base64). A copy of the database or a backup on its own
// reveals nothing. Stored as "v1.<iv>.<tag>.<ciphertext>", each part base64url.
//
// Make a key once:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Keep it in the host's environment settings and in the password manager. Losing it means sellers
// must enter their accounts again; it can never be recovered from the data.

const VERSION = 'v1';

function key(): Buffer | null {
  const raw = env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, 'base64');
  return k.length === 32 ? k : null;
}

/** False until PAYOUT_ENCRYPTION_KEY is set: payout details cannot be saved or read */
export const secretBoxReady = () => key() !== null;

export function seal(plain: string): string {
  const k = key();
  if (!k) throw new Error('PAYOUT_ENCRYPTION_KEY is not set');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function unseal(sealed: string): string {
  const k = key();
  if (!k) throw new Error('PAYOUT_ENCRYPTION_KEY is not set');
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Unknown sealed value');
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
