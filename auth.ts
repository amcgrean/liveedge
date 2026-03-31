import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq, or } from 'drizzle-orm';
import { getDb } from './db/index';
import { legacyUser, legacyLoginActivity } from './db/schema-legacy';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Keep authentication checks in Node-backed pages/layouts and API routes.
  // The Edge middleware path caused a Vercel runtime load failure, so this
  // config is intentionally consumed from server components and route handlers.
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { username, password } = parsed.data;

          // When DB is not configured, allow a dev bypass
          if (!process.env.DATABASE_URL && !process.env.BIDS_DATABASE_URL) {
            if (username === 'admin' && password === 'ChangeMe123!') {
              return { id: 'dev', name: 'Dev Admin', email: 'admin@beisserlumber.com', role: 'admin', branchId: null };
            }
            return null;
          }

          const db = getDb();
          const rows = await db
            .select()
            .from(legacyUser)
            .where(
              or(
                eq(legacyUser.username, username),
                eq(legacyUser.email, username)
              )
            )
            .limit(1);

          const user = rows[0];
          if (!user) return null;
          if (user.isActive === false) return null;

          // Plain-text password comparison (legacy DB — do not change without
          // updating the existing estimating app's login flow as well)
          if (password !== user.password) return null;

          const role = user.isAdmin ? 'admin' : user.isEstimator ? 'estimator' : 'viewer';

          // Track login activity
          try {
            await db.insert(legacyLoginActivity).values({
              userId: user.id,
              loggedIn: new Date(),
            });
          } catch (loginErr) {
            // Non-critical — don't block login if activity tracking fails
            console.warn('[auth] Failed to log login activity:', loginErr);
          }

          return {
            id: String(user.id),
            name: user.username,
            email: user.email || `${user.username}@beisserlumber.com`,
            role,
            branchId: user.userBranchId,
          };
        } catch (err) {
          console.error('[auth] authorize error:', err);
          return null;
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? 'estimator';
        token.branchId = (user as { branchId?: number | null }).branchId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { branchId?: number | null }).branchId = token.branchId as number | null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  // Allow local/dev startup without requiring .env setup.
  // In production, AUTH_SECRET should always be explicitly configured.
  secret: process.env.AUTH_SECRET ?? 'dev-only-auth-secret',
});

// Augment next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      branchId: number | null;
    };
  }
}
