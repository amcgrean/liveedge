import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import {
  setSelectedBranchId,
  setSelectedBranchCode,
  getBranchById,
  getBranchByCode,
  BRANCH_OPTIONS,
} from '@/lib/branch-context';

// POST /api/auth/set-branch
// Body: { branchId: number } OR { branchCode: "20GR" }
// Sets both the integer-ID cookie (legacy bids) and the string-code cookie (ERP modules).
// The string-code cookie is NOT httpOnly so TopNav can read it client-side.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { branchId?: number; branchCode?: string };

  // Handle "All Branches" clear
  if (body.branchCode === '' || body.branchCode === 'all') {
    await setSelectedBranchCode('');
    return NextResponse.json({ branchCode: '', label: 'All Branches' });
  }

  let branch;

  if (body.branchCode) {
    // Lookup by string code
    branch = await getBranchByCode(body.branchCode.toUpperCase());
    if (!branch) {
      // Accept codes that are in the hardcoded list even if not in DB
      const known = BRANCH_OPTIONS.find((b) => b.code === body.branchCode!.toUpperCase());
      if (known) {
        await setSelectedBranchCode(known.code);
        return NextResponse.json({ branchCode: known.code, label: known.label });
      }
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    }
  } else if (body.branchId) {
    const branchId = Number(body.branchId);
    if (!branchId || isNaN(branchId)) {
      return NextResponse.json({ error: 'branchId or branchCode is required' }, { status: 400 });
    }
    branch = await getBranchById(branchId);
    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: 'branchId or branchCode is required' }, { status: 400 });
  }

  // Set both cookies
  await setSelectedBranchId(branch.branchId);
  await setSelectedBranchCode(branch.branchCode);

  return NextResponse.json({
    branchId:   branch.branchId,
    branchCode: branch.branchCode,
    branchName: branch.branchName,
  });
}
