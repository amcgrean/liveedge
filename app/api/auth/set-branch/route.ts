import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import {
  setSelectedBranchId,
  getBranchById,
} from '@/lib/branch-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const branchId = Number(body.branchId);

  if (!branchId || isNaN(branchId)) {
    return NextResponse.json(
      { error: 'branchId is required' },
      { status: 400 }
    );
  }

  // Verify the branch exists
  const branch = await getBranchById(branchId);
  if (!branch) {
    return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
  }

  await setSelectedBranchId(branchId);

  return NextResponse.json({
    branchId: branch.branchId,
    branchName: branch.branchName,
  });
}
