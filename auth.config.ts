/**
 * Edge-compatible auth config (no Node.js-only packages).
 * Used by middleware.ts which runs on the Edge Runtime.
 * The full auth.ts adds credential verification (bcryptjs) for API routes.
 */
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? 'estimator';
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  providers: [],
  // Match auth.ts so middleware can still initialize in local/dev
  // environments where AUTH_SECRET has not been configured yet.
  secret: process.env.AUTH_SECRET ?? 'dev-only-auth-secret',
} satisfies NextAuthConfig;
