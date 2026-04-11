import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq, or } from 'drizzle-orm';
import { legacyUser, legacyLoginActivity } from './db/schema-legacy';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const otpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Keep authentication checks in Node-backed pages/layouts and API routes.
  // The Edge middleware path caused a Vercel runtime load failure, so this
  // config is intentionally consumed from server components and route handlers.
  providers: [
    // ──────────────────────────────────────────────────────────
    // Legacy username/password provider (beisser-takeoff users)
    // ──────────────────────────────────────────────────────────
    Credentials({
      id: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { username, password } = parsed.data;

          // Dev bypass when DB is not configured
          const hasDb =
            process.env.BIDS_DATABASE_URL ||
            process.env.POSTGRES_URL_NON_POOLING ||
            process.env.POSTGRES_URL;

          if (!hasDb) {
            if (username === 'admin' && password === 'ChangeMe123!') {
              return {
                id: 'dev',
                name: 'Dev Admin',
                email: 'admin@beisserlumber.com',
                role: 'admin',
                roles: ['admin'],
                branch: null,
                branchId: null,
              };
            }
            return null;
          }

          const { getDb } = await import('./db/index');
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

          const passwordOk = await bcrypt.compare(password, user.password);
          if (!passwordOk) return null;

          const role = user.isAdmin ? 'admin' : user.isEstimator ? 'estimator' : 'viewer';
          const roles: string[] = user.isAdmin
            ? ['admin']
            : user.isWarehouse
            ? ['warehouse']
            : user.isPurchasing
            ? ['purchasing']
            : user.isReceivingYard
            ? ['receiving_yard']
            : [];

          // Track login activity (non-critical)
          db.insert(legacyLoginActivity).values({
            userId: user.id,
            loggedIn: new Date(),
          }).catch((err) => console.warn('[auth] login activity log failed:', err));

          return {
            id: String(user.id),
            name: user.username,
            email: user.email ?? `${user.username}@beisserlumber.local`,
            role,
            roles,
            branch: null,
            branchId: user.userBranchId,
          };
        } catch (err) {
          console.error('[auth] credentials authorize error:', err);
          return null;
        }
      },
    }),

    // ──────────────────────────────────────────────────────────
    // OTP provider (WH-Tracker / ops users)
    // ──────────────────────────────────────────────────────────
    Credentials({
      id: 'otp',
      credentials: {
        email: { label: 'Email', type: 'email' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        try {
          const parsed = otpSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { email, code } = parsed.data;

          // Dev bypass: no DB configured
          const hasDb =
            process.env.BIDS_DATABASE_URL ||
            process.env.POSTGRES_URL_NON_POOLING ||
            process.env.POSTGRES_URL ||
            process.env.SUPABASE_DB_URL;

          if (!hasDb) {
            if (email === 'admin@beisserlumber.com' && code === '000000') {
              return {
                id: 'dev',
                name: 'Dev Admin',
                email: 'admin@beisserlumber.com',
                role: 'admin',
                roles: ['admin'],
                branch: null,
                branchId: null,
              };
            }
            return null;
          }

          // Use pooled URL for faster cold-start in serverless
          const { default: postgres } = await import('postgres');
          const otpDbUrl =
            process.env.POSTGRES_URL ||
            process.env.POSTGRES_URL_NON_POOLING ||
            process.env.POSTGRES_URL_UNPOOLED;
          if (!otpDbUrl) return null;
          const sql = postgres(otpDbUrl, { max: 1, idle_timeout: 10, connect_timeout: 8, prepare: false });

          // Verify OTP
          const otpRows = await sql<{ id: number; code: string }[]>`
            SELECT id, code
            FROM otp_codes
            WHERE email = ${email}
              AND used = false
              AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
          `;

          if (otpRows.length === 0) return null;

          const otp = otpRows[0];
          if (otp.code !== code) return null;

          // Mark code as used
          await sql`UPDATE otp_codes SET used = true WHERE id = ${otp.id}`;

          // Fetch user from public.app_users
          const userRows = await sql<{
            id: number;
            email: string;
            display_name: string | null;
            roles: string[] | null;
            branch: string | null;
          }[]>`
            SELECT id, email, display_name, roles, branch
            FROM app_users
            WHERE email = ${email}
              AND is_active = true
            LIMIT 1
          `;

          if (userRows.length === 0) return null;

          const user = userRows[0];
          const roles: string[] = Array.isArray(user.roles) ? user.roles : [];

          const role = roles.includes('admin')
            ? 'admin'
            : roles.some((r) =>
                ['ops', 'sales', 'supervisor', 'purchasing', 'warehouse', 'estimating'].includes(r)
              )
            ? 'estimator'
            : 'viewer';

          // Update last_login_at (non-critical)
          sql`UPDATE app_users SET last_login_at = NOW() WHERE id = ${user.id}`.catch(() => {});

          return {
            id: String(user.id),
            name: user.display_name ?? email.split('@')[0],
            email: user.email,
            role,
            roles,
            branch: user.branch ?? null,
            branchId: null,
          };
        } catch (err) {
          console.error('[auth] otp authorize error:', err);
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
        token.role = (user as { role?: string }).role ?? 'viewer';
        token.roles = (user as { roles?: string[] }).roles ?? [];
        token.branch = (user as { branch?: string | null }).branch ?? null;
        token.branchId = (user as { branchId?: number | null }).branchId ?? null;
      }
      // Compatibility: old JWTs from before WH-Tracker migration lack roles/branch
      if (!token.roles || (token.roles as string[]).length === 0) {
        if (token.role === 'admin') token.roles = ['admin'];
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { roles?: string[] }).roles = (token.roles ?? []) as string[];
        (session.user as { branch?: string | null }).branch = (token.branch ?? null) as string | null;
        (session.user as { branchId?: number | null }).branchId =
          token.branchId as number | null;
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
      role: string;         // 'admin' | 'estimator' | 'viewer'
      roles: string[];      // raw WH-Tracker roles: ['purchasing', 'warehouse', 'admin', ...]
      branch: string | null; // branch system_id code e.g. '20GR'
      branchId: number | null;
    };
  }
}
