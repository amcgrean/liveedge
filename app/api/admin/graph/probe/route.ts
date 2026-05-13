import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { graphFetch } from '@/lib/ms-graph';

// GET /api/admin/graph/probe?address=foo@bar.com
//
// Diagnostic endpoint. For each candidate address (or just the one passed in),
// probes Graph two ways:
//   1. /users/{address}        — does the user/mailbox object exist?
//   2. /users/{address}/messages?$top=1 — can THIS app actually read it?
// The second call catches the case where the mailbox exists but an Exchange
// Online RBAC scope (or Application Access Policy) blocks the app from it.

const DEFAULT_CANDIDATES = [
  'credits@beisserlumber.com',
  'credit@beisserlumber.com',
  'creditmemos@beisserlumber.com',
  'credit-memos@beisserlumber.com',
  'rma@beisserlumber.com',
];

type Probe = {
  address: string;
  exists: boolean;
  canRead: boolean;
  displayName?: string | null;
  userPrincipalName?: string | null;
  mail?: string | null;
  existsError?: string;
  readError?: string;
};

async function probeAddress(address: string): Promise<Probe> {
  const out: Probe = { address, exists: false, canRead: false };

  try {
    const res = await graphFetch(
      `/users/${encodeURIComponent(address)}?$select=displayName,userPrincipalName,mail,id`
    );
    if (res.ok) {
      const json = await res.json() as {
        displayName?: string;
        userPrincipalName?: string;
        mail?: string;
      };
      out.exists = true;
      out.displayName = json.displayName ?? null;
      out.userPrincipalName = json.userPrincipalName ?? null;
      out.mail = json.mail ?? null;
    } else {
      out.existsError = `${res.status} ${(await res.text()).slice(0, 200)}`;
    }
  } catch (err) {
    out.existsError = err instanceof Error ? err.message : String(err);
  }

  if (out.exists) {
    try {
      const res = await graphFetch(
        `/users/${encodeURIComponent(address)}/messages?$top=1&$select=id`
      );
      if (res.ok) {
        out.canRead = true;
      } else {
        out.readError = `${res.status} ${(await res.text()).slice(0, 200)}`;
      }
    } catch (err) {
      out.readError = err instanceof Error ? err.message : String(err);
    }
  }

  return out;
}

export async function GET(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const address = req.nextUrl.searchParams.get('address');
  const candidates = address ? [address] : DEFAULT_CANDIDATES;

  const probes = await Promise.all(candidates.map(probeAddress));
  return NextResponse.json({ probes });
}
