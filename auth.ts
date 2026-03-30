import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { sql } from 'drizzle-orm';
import { getDb } from './db/index';
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
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;

        // When DB is not configured, allow a dev bypass
        if (!process.env.DATABASE_URL) {
          if (
            username === 'admin' &&
            password === 'ChangeMe123!'
          ) {
            return { id: 'dev', name: 'Dev Admin', email: 'admin@beisserlumber.com', role: 'admin' };
          }
          return null;
        }

        const db = getDb();
        // Query the existing "user" table directly (uses serial id, username, password columns)
        const result = await db.execute(
          sql`SELECT id, username, email, password, is_active, is_admin, is_estimator
              FROM "user"
              WHERE username = ${username} OR email = ${username}
              LIMIT 1`
        );

        const user = result.rows?.[0] as {
          id: number;
          username: string;
          email: string;
          password: string;
          is_active: boolean | null;
          is_admin: boolean | null;
          is_estimator: boolean | null;
        } | undefined;

        if (!user || user.is_active === false) return null;

        // Plain-text password comparison (legacy DB — do not change without
        // updating the existing estimating app's login flow as well)
        if (password !== user.password) return null;

        const role = user.is_admin ? 'admin' : user.is_estimator ? 'estimator' : 'viewer';

        return {
          id: String(user.id),
          name: user.username,
          email: user.email,
          role,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
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
    };
  }
}
