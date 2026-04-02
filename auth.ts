import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

const otpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Keep authentication checks in Node-backed pages/layouts and API routes.
  // The Edge middleware path caused a Vercel runtime load failure, so this
  // config is intentionally consumed from server components and route handlers.
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        code:  { label: 'Code',  type: 'text'  },
      },
      async authorize(credentials) {
        try {
          const parsed = otpSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { email, code } = parsed.data;

          // Dev bypass: no DB configured, accept magic code
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

          // Lazy-import avoids loading the postgres client on the edge
          const { getErpSql } = await import('./db/supabase');
          const sql = getErpSql();

          // Verify OTP: find most-recent unused, non-expired code for this email
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

          // Mark code as used — one-time only
          await sql`UPDATE otp_codes SET used = true WHERE id = ${otp.id}`;

          // Fetch the authenticated user from public.app_users
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

          // Map WH-Tracker role array to a single estimating-app role string
          const role = roles.includes('admin')
            ? 'admin'
            : roles.some((r) =>
                ['ops', 'sales', 'supervisor', 'purchasing', 'warehouse'].includes(r)
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
            branchId: null, // app_users.branch is a string code; no integer FK in bids schema
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
