import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq, or } from 'drizzle-orm';
import { getDb } from './db/index';
import { legacyUser, legacyLoginActivity } from './db/schema-legacy';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const BCRYPT_PREFIX_RE = /^\$2[abxy]\$/;

/** Returns true if the stored hash looks like a bcrypt hash */
function isBcryptHash(stored: string) {
  return BCRYPT_PREFIX_RE.test(stored);
}

/** Verify password against stored value (bcrypt or legacy plaintext) */
async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

/** Upgrade a legacy plaintext password to bcrypt in the DB */
async function upgradePasswordHash(userId: number, plain: string) {
  try {
    const hash = await bcrypt.hash(plain, 12);
    const db = getDb();
    await db
      .update(legacyUser)
      .set({ password: hash, updatedAt: new Date() })
      .where(eq(legacyUser.id, userId));
  } catch (err) {
    // Non-critical — log but don't fail login
    console.warn('[auth] Failed to upgrade password hash:', err);
  }
}

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

          // Verify password — supports both bcrypt hashes and legacy plaintext.
          // On successful plaintext login, the hash is automatically upgraded.
          const passwordOk = await verifyPassword(password, user.password);
          if (!passwordOk) return null;

          // Auto-upgrade: if stored as plaintext, silently rehash to bcrypt
          if (!isBcryptHash(user.password)) {
            upgradePasswordHash(user.id, password);
          }

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
