import client, { IS_DEV_MODE } from './client';
import { User, AuthSession } from '@/types';

export interface OTPResponse {
  success: boolean;
  message?: string;
  expiresIn?: number;
}

export interface VerifyOTPRequest {
  username: string;
  code: string;
}

export interface VerifyOTPResponse {
  user: User;
  token: string;
  expiresIn: number;
}

/**
 * Request OTP for a username or email.
 *
 * Real backend contract (LiveEdge Next.js):
 *   POST /api/auth/send-otp { identifier: string } → { ok: true }
 *
 * The field is `identifier` (matches the LiveEdge web app which accepts either
 * a username or email and resolves to the user's email via app_users).
 */
export async function requestOTP(username: string): Promise<OTPResponse> {
  if (IS_DEV_MODE) {
    console.log('[AUTH] DEV MODE: simulating OTP send for', username);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { success: true, expiresIn: 300 };
  }
  const response = await client.post<{ ok?: boolean; error?: string }>(
    '/api/auth/send-otp',
    { identifier: username }
  );
  return {
    success: response.data?.ok === true,
    message: response.data?.error,
    expiresIn: 300,
  };
}

/**
 * Verify an OTP code and return a session.
 *
 * Real backend contract:
 *   POST /api/auth/mobile/verify-otp { identifier, code }
 *   → { user, token, expiresIn } on success, 401 on bad code
 *
 * The token is a JWT signed with the same AUTH_SECRET as NextAuth, so all
 * existing capability helpers (hasCapability, requireMobileAuth) accept it.
 */
export async function verifyOTP(req: VerifyOTPRequest): Promise<AuthSession> {
  if (IS_DEV_MODE) {
    console.log('[AUTH] DEV MODE: verifying code', req.code);
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (req.code !== '000000') {
      throw new Error('Invalid code (dev mode: use 000000)');
    }
    const expiresIn = 7 * 24 * 60 * 60;
    return {
      user: {
        id: 'dev-user-1',
        username: req.username,
        email: `${req.username}@dev.local`,
        name: req.username || 'Dev Driver',
        roles: ['driver'],
        branch: '20GR',
      },
      token: 'dev-token-' + Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }

  const response = await client.post<VerifyOTPResponse>('/api/auth/mobile/verify-otp', {
    identifier: req.username,
    code: req.code,
  });
  const { user, token, expiresIn } = response.data;
  return {
    user,
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function setBranch(token: string, branchCode: string): Promise<void> {
  if (IS_DEV_MODE) return;
  await client.post(
    '/api/auth/set-branch',
    { branch: branchCode },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function logout(token: string): Promise<void> {
  if (IS_DEV_MODE) return;
  try {
    await client.post(
      '/api/auth/logout',
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (error) {
    console.error('Logout error (ignored):', error);
  }
}
