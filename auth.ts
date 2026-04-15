import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq, or } from 'drizzle-orm';
import { legacyUser, legacyLoginActivity } from './db/schema-legacy';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

// ─── Input schema ─────────────────────────────────────────────────────────────
// Accepts either:
//   { identifier: email,    otp_code: "123456" }  → OTP flow
//   { identifier: username, password: "secret" }  → password flow
const unifiedSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().optional(),
  otp_code: z.string().optional(),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Keep authentication checks in Node-backed pages/layouts and API routes.
  // The Edge middleware path caused a Vercel runtime load failure, so this
  // config is intentionally consumed from server components and route handlers.
  providers: [
    // ──────────────────────────────────────────────────────────
    // Unified credentials provider
    //
    // Routing logic:
    //   identifier contains "@"  → OTP flow (public.app_users + otp_codes)
    //   identifier has no "@"    → password flow (public.app_users first,
    //                              then bids."user" fallback during transition)
    // ──────────────────────────────────────────────────────────
    Credentials({
      id: 'credentials',
      credentials: {
        identifier: { label: 'Email or username', type: 'text' },
        password:   { label: 'Password',          type: 'password' },
        otp_code:   { label: 'Code',              type: 'text' },
      },
      async authorize(credentials) {
        try {
          const parsed = unifiedSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { identifier, password, otp_code } = parsed.data;
          const isEmail = identifier.includes('@');

          // ── Dev bypass (no DB configured) ────────────────────────────────
          const hasDb =
            process.env.BIDS_DATABASE_URL ||
            process.env.POSTGRES_URL_NON_POOLING ||
            process.env.POSTGRES_URL;

          if (!hasDb) {
            // Username "admin" / password "ChangeMe123!" always works in dev
            if (!isEmail && identifier === 'admin' && password === 'ChangeMe123!') {
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
            // OTP dev bypass: any email with code "000000"
            if (isEmail && otp_code === '000000') {
              return {
                id: 'dev',
                name: identifier.split('@')[0],
                email: identifier,
                role: 'estimator',
                roles: ['estimating'],
                branch: null,
                branchId: null,
              };
            }
            return null;
          }

          // ── DB connection ─────────────────────────────────────────────────
          const { default: postgres } = await import('postgres');
          const dbUrl =
            process.env.POSTGRES_URL ||
            process.env.POSTGRES_URL_NON_POOLING ||
            process.env.BIDS_DATABASE_URL;
          if (!dbUrl) return null;
          const sql = postgres(dbUrl, { max: 1, idle_timeout: 10, connect_timeout: 8, prepare: false });

          // ── OTP flow (email users) ────────────────────────────────────────
          if (isEmail) {
            if (!otp_code) return null; // OTP step not yet completed

            const email = identifier.trim().toLowerCase();

            // Verify OTP code
            const otpRows = await sql<{ id: number; code: string }[]>`
              SELECT id, code
              FROM otp_codes
              WHERE email = ${email}
                AND used = false
                AND expires_at > NOW()
              ORDER BY created_at DESC
              LIMIT 1
            `;

            if (otpRows.length === 0) {
              console.warn('[auth/otp] no valid code for', email);
              return null;
            }

            if (otpRows[0].code !== otp_code.trim()) {
              console.warn('[auth/otp] code mismatch for', email);
              return null;
            }

            // Mark code as used
            await sql`UPDATE otp_codes SET used = true WHERE id = ${otpRows[0].id}`;

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

            if (userRows.length === 0) {
              console.warn('[auth/otp] user not found in app_users for', email);
              return null;
            }

            const user = userRows[0];
            const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
            const role = deriveRole(roles);

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
          }

          // ── Password flow (username users) ────────────────────────────────
          if (!password) return null;

          const username = identifier.trim().toLowerCase();

          // 1. Try public.app_users first (unified table)
          const appRows = await sql<{
            id: number;
            email: string;
            display_name: string | null;
            username: string | null;
            password_hash: string | null;
            roles: string[] | null;
            branch: string | null;
          }[]>`
            SELECT id, email, display_name, username, password_hash, roles, branch
            FROM app_users
            WHERE username = ${username}
              AND is_active = true
            LIMIT 1
          `;

          if (appRows.length > 0) {
            const user = appRows[0];
            if (!user.password_hash) {
              console.warn('[auth/password] app_user has no password_hash:', username);
              return null;
            }
            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) return null;

            const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
            const role = deriveRole(roles);

            sql`UPDATE app_users SET last_login_at = NOW() WHERE id = ${user.id}`.catch(() => {});

            return {
              id: String(user.id),
              name: user.display_name ?? user.username ?? username,
              email: user.email,
              role,
              roles,
              branch: user.branch ?? null,
              branchId: null,
            };
          }

          // 2. Fallback: bids."user" legacy table (transition safety net)
          //    Used when migration hasn't run yet or for users not yet in app_users.
          console.warn('[auth/password] username not in app_users, trying legacy bids."user":', username);

          const { getDb } = await import('./db/index');
          const db = getDb();
          const legacyRows = await db
            .select()
            .from(legacyUser)
            .where(
              or(
                eq(legacyUser.username, username),
                eq(legacyUser.email, username)
              )
            )
            .limit(1);

          const legacyRow = legacyRows[0];
          if (!legacyRow) return null;
          if (legacyRow.isActive === false) return null;

          const passwordOk = await bcrypt.compare(password, legacyRow.password);
          if (!passwordOk) return null;

          const legacyRole = legacyRow.isAdmin ? 'admin' : legacyRow.isEstimator ? 'estimator' : 'viewer';
          const legacyRoles: string[] = legacyRow.isAdmin
            ? ['admin']
            : legacyRow.isWarehouse
            ? ['warehouse']
            : legacyRow.isPurchasing
            ? ['purchasing']
            : legacyRow.isReceivingYard
            ? ['receiving_yard']
            : [];

          // Non-critical: log activity
          db.insert(legacyLoginActivity).values({
            userId: legacyRow.id,
            loggedIn: new Date(),
          }).catch((err) => console.warn('[auth] login activity log failed:', err));

          return {
            id: String(legacyRow.id),
            name: legacyRow.username,
            email: legacyRow.email ?? `${legacyRow.username}@beisserlumber.local`,
            role: legacyRole,
            roles: legacyRoles,
            branch: null,
            branchId: legacyRow.userBranchId,
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

/** Map a roles[] array to the primary scalar `role` string. */
function deriveRole(roles: string[]): string {
  if (roles.includes('admin')) return 'admin';
  if (roles.some((r) => ['ops', 'sales', 'supervisor', 'purchasing', 'warehouse',
                         'estimating', 'estimator', 'designer', 'receiving_yard',
                         'dispatch', 'driver'].includes(r))) return 'estimator';
  return 'viewer';
}

// Augment next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;         // 'admin' | 'estimator' | 'viewer'
      roles: string[];      // raw roles: ['warehouse', 'purchasing', 'admin', ...]
      branch: string | null; // branch system_id code e.g. '20GR'
      branchId: number | null;
    };
  }
}
