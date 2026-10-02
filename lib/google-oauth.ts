/**
 * Google OAuth and token management for Calendar sync.
 * Separate from Supabase Google sign-in — uses incremental consent and offline access.
 */

import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const GOOGLE_TOKEN_ENC_KEY = process.env.GOOGLE_TOKEN_ENC_KEY || ''; // 32 bytes base64
const GOOGLE_OAUTH_CALLBACK_URL = process.env.NEXT_PUBLIC_SITE_URL 
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/google/callback`
  : 'https://wardsignup.com/api/integrations/google/callback';

const STATE_SECRET = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.CRON_SECRET || 'dev-secret-change-in-prod';
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthState {
  userId: string;
  orgId: string;
  nonce: string;
  returnPath: string;
  expiresAt: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Sign OAuth state with HMAC to prevent tampering.
 */
export function signState(state: OAuthState): string {
  const payload = JSON.stringify(state);
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const hmac = createHmac('sha256', STATE_SECRET);
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Verify and parse signed OAuth state.
 */
export function verifyState(signed: string): OAuthState | null {
  try {
    const parts = signed.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, signature] = parts;
    
    // Verify signature
    const hmac = createHmac('sha256', STATE_SECRET);
    hmac.update(payloadB64);
    const expectedSignature = hmac.digest('base64url');
    
    if (signature !== expectedSignature) {
      return null;
    }

    // Parse and validate expiry
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const state = JSON.parse(payload) as OAuthState;
    
    if (Date.now() > state.expiresAt) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * Encrypt refresh token with AES-256-GCM.
 */
export function encryptToken(plaintext: string): string {
  if (!GOOGLE_TOKEN_ENC_KEY) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY not set');
  }

  const key = Buffer.from(GOOGLE_TOKEN_ENC_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY must be 32 bytes (base64)');
  }

  const iv = randomBytes(12); // GCM recommended IV size
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv.authTag.ciphertext (all base64)
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted}`;
}

/**
 * Decrypt refresh token with AES-256-GCM.
 */
export function decryptToken(encrypted: string): string {
  if (!GOOGLE_TOKEN_ENC_KEY) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY not set');
  }

  const key = Buffer.from(GOOGLE_TOKEN_ENC_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY must be 32 bytes (base64)');
  }

  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivB64, authTagB64, ciphertext] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Build Google OAuth authorization URL.
 */
export function buildAuthUrl(state: OAuthState): string {
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID not set');
  }

  const signedState = signState(state);
  
  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: GOOGLE_OAUTH_CALLBACK_URL,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: signedState,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: GOOGLE_OAUTH_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

/**
 * Refresh access token from encrypted refresh token.
 */
export async function refreshAccessToken(refreshTokenEnc: string): Promise<TokenResponse> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const refreshToken = decryptToken(refreshTokenEnc);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

/**
 * Revoke a refresh token at Google.
 */
export async function revokeToken(refreshTokenEnc: string): Promise<void> {
  const refreshToken = decryptToken(refreshTokenEnc);

  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token revocation failed: ${error}`);
  }
}

/**
 * List calendars accessible with the given access token.
 */
export async function listCalendars(accessToken: string): Promise<any> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list calendars: ${error}`);
  }

  return response.json();
}
