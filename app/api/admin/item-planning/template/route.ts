import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { generateCSV } from '@/lib/csv-utils';

// GET /api/admin/item-planning/template
// Returns a CSV template with header row + one example row for each branch.
// Buyers fill this out per item; POST the file back to /import.
export async function GET() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  // Order matches the columns the /import endpoint reads.
  const columns = [
    'systemId',          // 10FD | 20GR | 25BW | 40CV
    'itemCode',          // agility_items.item
    'minOnHand',         // floor — below this is outage risk
    'targetOnHand',      // reorder-up-to (max)
    'safetyStockDays',   // buffer beyond lead time (overrides branch default)
    'usageWindowDays',   // demand lookback days (overrides branch default)
    'seasonalityFactor', // flat multiplier on baseline usage (1.0 = none)
    'packQty',           // order rounding step
    'preferredSupplier', // override Agility's primary supplier
    'category',          // 'millwork' | 'lumber' | etc.
    'isCritical',        // TRUE / FALSE
    'isPaused',          // TRUE / FALSE
    'notes',
  ];

  const examples = [
    {
      systemId: '20GR', itemCode: 'EXAMPLE-MW-1', minOnHand: 12, targetOnHand: 48,
      safetyStockDays: 14, usageWindowDays: 90, seasonalityFactor: 1.0, packQty: 6,
      preferredSupplier: '', category: 'millwork', isCritical: 'TRUE', isPaused: 'FALSE',
      notes: 'Example — delete this row before importing',
    },
    {
      systemId: '20GR', itemCode: 'EXAMPLE-MW-2', minOnHand: '', targetOnHand: '',
      safetyStockDays: '', usageWindowDays: '', seasonalityFactor: '', packQty: '',
      preferredSupplier: '', category: 'millwork', isCritical: 'FALSE', isPaused: 'FALSE',
      notes: 'Blank numeric cells fall back to branch defaults',
    },
  ];

  const csv = generateCSV(examples, columns);

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="item-planning-template.csv"',
    },
  });
}
