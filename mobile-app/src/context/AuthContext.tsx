import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AuthSession, User } from '@/types';
import * as authAPI from '@/api/auth';
import { setAuthToken } from '@/api/authToken';

interface AuthContextType {
  session: AuthSession | null;
  isLoading: boolean;
  isSignedIn: boolean;
  requestOTP: (username: string) => Promise<void>;
  verifyOTP: (username: string, code: string) => Promise<void>;
  setBranch: (branchCode: string) => Promise<void>;
  logout: () => Promise<void>;
  user: User | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_SESSION_KEY = 'auth_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session from secure storage on app start
  useEffect(() => {
    bootstrapAsync();
  }, []);

  const bootstrapAsync = async () => {
    try {
      const sessionData = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        // Check if token is still valid
        if (parsed.expiresAt > Date.now()) {
          setSession(parsed);
          setAuthToken(parsed.token);
        } else {
          // Token expired, clear it
          await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
          setAuthToken(null);
        }
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const requestOTP = async (username: string) => {
    const result = await authAPI.requestOTP(username);
    if (!result.success) {
      throw new Error(result.message || 'Failed to send OTP');
    }
  };

  const verifyOTP = async (username: string, code: string) => {
    const newSession = await authAPI.verifyOTP({ username, code });
    setSession(newSession);
    setAuthToken(newSession.token);
    // Store in secure storage
    await SecureStore.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(newSession));
  };

  const setBranch = async (branchCode: string) => {
    if (!session?.token) throw new Error('Not authenticated');
    await authAPI.setBranch(session.token, branchCode);
    // Update local session
    setSession((s) =>
      s
        ? {
            ...s,
            user: { ...s.user, branch: branchCode },
          }
        : null
    );
  };

  const logout = async () => {
    if (session?.token) {
      await authAPI.logout(session.token);
    }
    setSession(null);
    setAuthToken(null);
    await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
  };

  const value: AuthContextType = {
    session,
    isLoading,
    isSignedIn: session !== null,
    requestOTP,
    verifyOTP,
    setBranch,
    logout,
    user: session?.user ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
