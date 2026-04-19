import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

// ─── Input schema ─────────────────────────────────────────────────────────────
// All users authenticate via OTP — identifier can be a username or email,
// the server resolves it to an email and issues a code.
const unifiedSchema = z.object({
  identifier: z.string().min(1),
  otp_code:   z.string().optional(),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      id: 'credentials',
      credentials: {
        identifier: { label: 'Email or username', type: 'text' },
        otp_code:   { label: 'Code',              type: 'text' },
      },
      async authorize(credentials) {
        try {
          const parsed = unifiedSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { identifier, otp_code } = parsed.data;
          if (!otp_code) return null; // OTP step not yet completed

          // ── Dev bypass ────────────────────────────────────────────────────
          const hasDb =
            process.env.BIDS_DATABASE_URL ||
            process.env.POSTGRES_URL_NON_POOLING ||
            process.env.POSTGRES_URL;

          if (!hasDb) {
            if ((identifier === 'admin' || identifier === 'admin@beisserlumber.com') && otp_code === '000000') {
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

          // ── DB connection ─────────────────────────────────────────────────
          const { default: postgres } = await import('postgres');
          const dbUrl =
            process.env.POSTGRES_URL ||
            process.env.POSTGRES_URL_NON_POOLING ||
            process.env.BIDS_DATABASE_URL;
          if (!dbUrl) return null;
          const sql = postgres(dbUrl, { max: 1, idle_timeout: 10, connect_timeout: 8, prepare: false });

          // ── Resolve identifier → email ────────────────────────────────────
          // Username-based identifiers need to be looked up first so we can
          // check the OTP code (which is always keyed by email).
          const input = identifier.trim().toLowerCase();
          const isEmail = input.includes('@');

          const userRows = await sql<{
            id: number;
            email: string;
            display_name: string | null;
            roles: string[] | null;
            branch: string | null;
            agent_id: string | null;
          }[]>`
            SELECT id, email, display_name, roles, branch, agent_id
            FROM app_users
            WHERE ${isEmail ? sql`email = ${input}` : sql`username = ${input}`}
              AND is_active = true
            LIMIT 1
          `;

          if (userRows.length === 0) {
            console.warn('[auth/otp] user not found in app_users for', input);
            return null;
          }

          const user = userRows[0];
          const email = user.email;

          // ── Verify OTP ────────────────────────────────────────────────────
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
          sql`UPDATE app_users SET last_login_at = NOW() WHERE id = ${user.id}`.catch(() => {});

          const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
          const role = deriveRole(roles);

          return {
            id: String(user.id),
            name: user.display_name ?? input.split('@')[0],
            email: user.email,
            role,
            roles,
            branch: user.branch ?? null,
            branchId: null,
            agentId: user.agent_id ?? null,
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
        token.agentId = (user as { agentId?: string | null }).agentId ?? null;
      }
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
        (session.user as { branchId?: number | null }).branchId = token.branchId as number | null;
        (session.user as { agentId?: string | null }).agentId = (token.agentId ?? null) as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
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
      role: string;
      roles: string[];
      branch: string | null;
      branchId: number | null;
      agentId: string | null;
    };
  }
}
