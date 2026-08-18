import crypto from 'crypto';

/**
 * Master key derivation for AES-256-GCM encryption at rest.
 * Uses unified ENCRYPTION_SECRET environment variable.
 */
function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  if (isProduction) {
    if (!secret || secret.trim().length < 32) {
      throw new Error('FATAL: ENCRYPTION_SECRET environment variable must be configured and at least 32 characters long in production.');
    }
    return crypto.createHash('sha256').update(secret.trim()).digest();
  }

  // Development / Test environment default (never used in production)
  const devSecret = secret || 'antigravity-universal-affiliate-master-key-2026-dev';
  return crypto.createHash('sha256').update(devSecret).digest();
}

/**
 * Encrypt sensitive tokens at rest using AES-256-GCM
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
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
    if (parts.length !== 3) return encryptedPayload; // Plaintext fallback during migration
    const masterKey = getMasterKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const cipherText = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
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
 * Generate cryptographically secure random token (CSPRNG)
 * Format: prefix_randomHex48 (e.g. mw_live_sec_a3f89...)
 */
export function generateSecureToken(prefix?: string): string {
  const randomHex = crypto.randomBytes(24).toString('hex');
  if (prefix) {
    return `${prefix.toLowerCase()}_live_sec_${randomHex}`;
  }
  return `sec_${randomHex}`;
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

/**
 * Deterministic SHA-256 Hash for TikTok Match Keys and Idempotency Keys
 */
export function hashSha256(value: string): string {
  const clean = (value || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Mask sensitive credentials for UI display and audit logging
 */
export function maskSecret(secret?: string): string {
  if (!secret) return '••••••••';
  if (secret.length <= 8) return '••••••••';
  return `${secret.substring(0, 4)}••••••••${secret.substring(secret.length - 4)}`;
}

/**
 * Sanitize raw inbound payload and headers before logging to eliminate credential leakage
 */
export function sanitizeInboundPayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const sensitiveKeys = ['token', 'secret', 'password', 'authorization', 'access_token', 'encryption_secret', 'key'];
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeInboundPayload(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const lowerKey = k.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      sanitized[k] = typeof v === 'string' ? maskSecret(v) : '[REDACTED]';
    } else if (v && typeof v === 'object') {
      sanitized[k] = sanitizeInboundPayload(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}
