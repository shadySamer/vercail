import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '../db/store';
import { Session, User } from '../types';

/**
 * Hash password with unique cryptographically random salt using scrypt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password against salt:derivedKey hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const salt = parts[0];
    const originalDerivedKey = parts[1];
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(originalDerivedKey, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Create a new cryptographically secure session
 */
export function createSessionToken(): string {
  return `sess_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Extract authenticated workspace and user from request session cookie or Bearer token.
 * Enforces strict multi-tenant boundary.
 */
export function getAuthenticatedWorkspace(request: NextRequest): { workspaceId: string; user?: User } | null {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  // 1. Try Bearer token in Authorization header
  const authHeader = request.headers.get('authorization');
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Try session cookie
  if (!token) {
    token = request.cookies.get('session_token')?.value;
  }

  if (token) {
    const session = db.getSessionByToken(token);
    if (session) {
      const now = new Date().toISOString();
      if (session.expiresAt > now) {
        const user = db.getUserById(session.userId);
        return { workspaceId: session.workspaceId, user };
      }
    }
  }

  // Strict Fail in Production: No session = No access (Zero default fallback)
  if (isProduction) {
    return null;
  }

  // Development convenience only: fallback to first existing workspace if none configured
  const workspaces = db.getWorkspaces();
  if (workspaces.length > 0) {
    return { workspaceId: workspaces[0].id };
  }

  return null;
}
