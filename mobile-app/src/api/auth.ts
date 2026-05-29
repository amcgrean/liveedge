import client from './client';
import { User, AuthSession } from '@/types';

export interface OTPResponse {
  success: boolean;
  message?: string;
  expiresIn?: number; // seconds
}

export interface VerifyOTPRequest {
  username: string;
  code: string;
}

export interface VerifyOTPResponse {
  user: User;
  token: string;
  expiresIn: number; // seconds
}

// Dev mode: when no backend URL configured, accept any username + code 000000
const DEV_MODE =
  !process.env.EXPO_BACKEND_URL ||
  process.env.EXPO_BACKEND_URL.includes('localhost');

/**
 * Request OTP for username/email
 */
export async function requestOTP(username: string): Promise<OTPResponse> {
  if (DEV_MODE) {
    console.log('[AUTH] DEV MODE: simulating OTP send for', username);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { success: true, expiresIn: 300 };
  }
  const response = await client.post<OTPResponse>('/api/auth/send-otp', {
    username,
  });
  return response.data;
}

/**
 * Verify OTP code and get session token
 */
export async function verifyOTP(req: VerifyOTPRequest): Promise<AuthSession> {
  if (DEV_MODE) {
    console.log('[AUTH] DEV MODE: verifying code', req.code);
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (req.code !== '000000') {
      throw new Error('Invalid code (dev mode: use 000000)');
    }
    const expiresIn = 7 * 24 * 60 * 60; // 7 days
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

  const response = await client.post<VerifyOTPResponse>('/api/auth/send-otp', {
    username: req.username,
    code: req.code,
  });

  const { user, token, expiresIn } = response.data;
  const expiresAt = Date.now() + expiresIn * 1000;

  return {
    user,
    token,
    expiresAt,
  };
}

/**
 * Set active branch for user
 */
export async function setBranch(token: string, branchCode: string): Promise<void> {
  if (DEV_MODE) return;
  await client.post('/api/auth/set-branch', { branch: branchCode }, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Logout (clear session server-side)
 */
export async function logout(token: string): Promise<void> {
  if (DEV_MODE) return;
  try {
    await client.post('/api/auth/logout', {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    // Logout always succeeds locally, even if server fails
    console.error('Logout error (ignored):', error);
  }
}
