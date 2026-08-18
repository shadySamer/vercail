import crypto from 'crypto';

// Master key derivation for encryption at rest (defaults to 32-byte key derived from env or static fallback for dev)
const ENCRYPTION_SECRET = process.env.MASTER_ENCRYPTION_KEY || 'antigravity-universal-affiliate-master-key-2026';
const MASTER_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

/**
 * Encrypt sensitive tokens at rest using AES-256-GCM
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive tokens encrypted with AES-256-GCM
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) return encryptedPayload; // Fallback if plain
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const cipherText = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err);
    return '';
  }
}

/**
 * Decrypt ClickBank INS v6.0 / v7.0 AES-256-CBC Encrypted Notification
 * ClickBank derivation: SHA1(secret_key).substring(0, 32)
 */
export function decryptClickBankINS(secretKey: string, ivBase64: string, encryptedBase64: string): string {
  try {
    const key = crypto.createHash('sha1').update(secretKey).digest('hex').substring(0, 32);
    const iv = Buffer.from(ivBase64, 'base64');
    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'utf8'), iv);
    let decrypted = decipher.update(encryptedBuffer, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    throw new Error(`ClickBank INS Decryption failed: ${err.message}`);
  }
}

/**
 * Verify Digistore24 Generic IPN Signature using SHA-512 Passphrase
 */
export function verifyDigistore24Signature(passphrase: string, params: Record<string, any>, signatureHeader?: string): boolean {
  if (!passphrase) return true; // If no passphrase configured, rely on secret endpoint token
  try {
    // Sort keys alphabetically excluding sha_sign / signature
    const sortedKeys = Object.keys(params).filter(k => k !== 'sha_sign' && k !== 'signature').sort();
    let dataString = '';
    for (const key of sortedKeys) {
      dataString += `${key}=${params[key]}`;
    }
    const computedHash = crypto.createHash('sha512').update(passphrase + dataString).digest('hex').toUpperCase();
    const incomingSignature = (signatureHeader || params.sha_sign || params.signature || '').toUpperCase();
    return computedHash === incomingSignature;
  } catch (err) {
    return false;
  }
}

export function hashSha256(value: string): string {
  const clean = (value || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Mask sensitive credentials for UI display and audit logging
 */
export function maskSecret(secret?: string): string {
  if (!secret) return '••••••••';
  if (secret.length <= 6) return '••••••';
  return `${secret.substring(0, 3)}••••••••${secret.substring(secret.length - 3)}`;
}
