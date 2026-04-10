import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { agilityApi } from '../../../../../src/lib/agility-api';

/**
 * POST /api/admin/agility/test
 *
 * Live connectivity test against the Agility API.
 * Performs: Login → AgilityVersion → BranchList → Logout
 *
 * Returns version string, available branches, and session timing.
 * Use this from the admin panel to verify API credentials before enabling features.
 *
 * Body (optional):
 *   { "branch": "20GR" }  — test against a specific branch
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!agilityApi.isConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Agility API not configured',
        hint: 'Set AGILITY_API_URL, AGILITY_USERNAME, and AGILITY_PASSWORD environment variables.',
      },
      { status: 503 }
    );
  }

  let body: { branch?: string } = {};
  try {
    body = (await req.json()) as { branch?: string };
  } catch {
    // No body or invalid JSON — use defaults
  }

  const branchOption = body.branch ? { branch: body.branch } : {};
  const steps: { step: string; ok: boolean; detail?: string; ms?: number }[] = [];
  const t0 = Date.now();

  // Step 1: Login
  try {
    const t = Date.now();
    await agilityApi.login(body.branch ?? '');
    steps.push({ step: 'Login', ok: true, ms: Date.now() - t });
  } catch (err) {
    steps.push({
      step: 'Login',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ success: false, steps, totalMs: Date.now() - t0 });
  }

  // Step 2: AgilityVersion
  let version = 'unknown';
  try {
    const t = Date.now();
    version = await agilityApi.fetchVersion();
    steps.push({ step: 'AgilityVersion', ok: true, detail: version, ms: Date.now() - t });
  } catch (err) {
    steps.push({
      step: 'AgilityVersion',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 3: BranchList
  let branches: { Branch: string; BranchName: string; Active: boolean }[] = [];
  try {
    const t = Date.now();
    branches = await agilityApi.fetchBranchList(branchOption);
    steps.push({
      step: 'BranchList',
      ok: true,
      detail: `${branches.length} branch(es) returned`,
      ms: Date.now() - t,
    });
  } catch (err) {
    steps.push({
      step: 'BranchList',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 4: Logout (best effort)
  try {
    const t = Date.now();
    await agilityApi.logout(body.branch ?? '');
    steps.push({ step: 'Logout', ok: true, ms: Date.now() - t });
  } catch {
    steps.push({ step: 'Logout', ok: false, detail: 'Logout failed (non-critical)' });
  }

  const allOk = steps.filter((s) => s.step !== 'Logout').every((s) => s.ok);

  return NextResponse.json({
    success: allOk,
    version,
    branches,
    steps,
    totalMs: Date.now() - t0,
    hint: allOk
      ? 'Connection successful. Update BRANCH_MAP in agility-api.ts if branch codes differ from expected.'
      : 'One or more steps failed. Check credentials and API URL.',
  });
}
