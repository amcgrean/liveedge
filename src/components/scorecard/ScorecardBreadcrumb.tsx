import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type Origin =
  | { kind: 'customer'; id: string }
  | { kind: 'vendor'; code: string }
  | { kind: 'rep'; code: string }
  | { kind: 'branch'; id: string }
  | { kind: 'product-major'; code: string }
  | { kind: 'product-minor'; majorCode: string; minorCode: string }
  | { kind: 'product-item'; code: string }
  | { kind: 'product-overview' }
  | { kind: 'vendor-overview' }
  | { kind: 'purchasing-suggested-buys' };

function parseFrom(from: string | null | undefined): Origin | null {
  if (!from) return null;
  const [kind, ...rest] = from.split(':');
  const value = rest.join(':');
  switch (kind) {
    case 'customer':
      return value ? { kind: 'customer', id: value } : null;
    case 'vendor':
      return value ? { kind: 'vendor', code: value } : null;
    case 'rep':
      return value ? { kind: 'rep', code: value } : null;
    case 'branch':
      return value ? { kind: 'branch', id: value } : null;
    case 'product-major':
      return value ? { kind: 'product-major', code: value } : null;
    case 'product-minor': {
      const [majorCode, minorCode] = value.split('|');
      return majorCode && minorCode ? { kind: 'product-minor', majorCode, minorCode } : null;
    }
    case 'product-item':
      return value ? { kind: 'product-item', code: value } : null;
    case 'product-overview':
      return { kind: 'product-overview' };
    case 'vendor-overview':
      return { kind: 'vendor-overview' };
    case 'purchasing-suggested-buys':
      return { kind: 'purchasing-suggested-buys' };
    default:
      return null;
  }
}

function originLink(origin: Origin): { href: string; label: string } {
  switch (origin.kind) {
    case 'customer':
      return { href: `/scorecard/${encodeURIComponent(origin.id)}`, label: 'Customer' };
    case 'vendor':
      return { href: `/scorecard/vendor/${encodeURIComponent(origin.code)}`, label: 'Vendor' };
    case 'rep':
      return { href: `/scorecard/rep/${encodeURIComponent(origin.code)}`, label: 'Sales Rep' };
    case 'branch':
      return { href: `/scorecard/branch/${encodeURIComponent(origin.id)}`, label: 'Branch' };
    case 'product-major':
      return { href: `/scorecard/product/major/${encodeURIComponent(origin.code)}`, label: 'Product Group' };
    case 'product-minor':
      return {
        href: `/scorecard/product/minor/${encodeURIComponent(origin.majorCode)}/${encodeURIComponent(origin.minorCode)}`,
        label: 'Product Minor',
      };
    case 'product-item':
      return { href: `/scorecard/product/item/${encodeURIComponent(origin.code)}`, label: 'Item' };
    case 'product-overview':
      return { href: '/scorecard/product', label: 'Product Groups' };
    case 'vendor-overview':
      return { href: '/scorecard/vendor', label: 'Vendors' };
    case 'purchasing-suggested-buys':
      return { href: '/purchasing/suggested-buys', label: 'Suggested Buys' };
  }
}

type FallbackKey = 'product' | 'vendor' | 'overview';

const FALLBACK: Record<FallbackKey, { href: string; label: string }> = {
  product: { href: '/scorecard/product', label: 'Product Groups' },
  vendor: { href: '/scorecard/vendor', label: 'Vendors' },
  overview: { href: '/scorecard/overview', label: 'Scorecard' },
};

export default function ScorecardBreadcrumb({
  from,
  fallback = 'overview',
}: {
  from?: string | string[] | null;
  fallback?: FallbackKey;
}) {
  const raw = Array.isArray(from) ? from[0] : from ?? null;
  const origin = parseFrom(raw);
  const target = origin ? originLink(origin) : FALLBACK[fallback];

  return (
    <Link
      href={target.href}
      className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition print:hidden"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      <span>Back to {target.label}</span>
    </Link>
  );
}

export type ScorecardOrigin = Origin;
