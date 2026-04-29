'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, MapPin, MapPinOff, CheckCircle2, XCircle,
  Building2, Hash, Calendar, User, Truck,
} from 'lucide-react';
import type { JobDetail } from '../../../api/admin/jobs/[so_id]/route';
import { cn } from '../../../../src/lib/utils';

const JobLocationMap = dynamic(
  () => import('../../../../src/components/admin/JobLocationMap').then((m) => m.JobLocationMap),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">Loading map…</div> }
);

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const STATUS_LABELS: Record<string, string> = {
  O: 'Open', H: 'Hold', C: 'Closed', X: 'Cancelled', Q: 'Quote',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-white">{value ?? <span className="text-slate-600">—</span>}</dd>
    </div>
  );
}

interface Props { soId: string; }

export default function JobDetailClient({ soId }: Props) {
  const [job, setJob]       = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/jobs/${encodeURIComponent(soId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<JobDetail>;
      })
      .then(setJob)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [soId]);

  const statusLabel = STATUS_LABELS[(job?.so_status ?? '').toUpperCase()] ?? job?.so_status ?? '—';
  const statusCls   = job?.so_status?.toUpperCase() === 'O' ? 'bg-emerald-500/15 text-emerald-400'
                    : job?.so_status?.toUpperCase() === 'C' ? 'bg-slate-500/20 text-slate-400'
                    : job?.so_status?.toUpperCase() === 'X' ? 'bg-red-500/15 text-red-400'
                    : job?.so_status?.toUpperCase() === 'H' ? 'bg-amber-500/15 text-amber-400'
                    : job?.so_status?.toUpperCase() === 'Q' ? 'bg-violet-500/15 text-violet-400'
                    : 'bg-slate-500/15 text-slate-400';

  const fullAddress = [
    job?.address_1,
    [job?.city, job?.shipto_state].filter(Boolean).join(', '),
    job?.shipto_zip,
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <div>
        <Link
          href="/admin/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          All Jobs
        </Link>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-500">Loading job {soId}…</div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-400 text-sm">
          Failed to load job: {error}
        </div>
      )}

      {job && (
        <>
          {/* Header */}
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white font-mono">SO {job.so_id}</h1>
                <span className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold', statusCls)}>
                  {statusLabel}
                </span>
                {job.gps_matched ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> GPS Matched
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400">
                    <XCircle className="w-3.5 h-3.5" /> No GPS Coordinates
                  </span>
                )}
              </div>
              <p className="text-slate-400 mt-1 text-sm">
                {BRANCH_LABELS[job.system_id] ?? job.system_id} · {job.cust_name ?? 'Unknown Customer'}
              </p>
            </div>
          </div>

          {/* Main layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Job info */}
            <div className="space-y-4">
              {/* Customer & address */}
              <div className="rounded-xl bg-slate-900 border border-white/10 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" /> Customer & Address
                </h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="Customer Name" value={job.cust_name} />
                  <Field label="Customer Code" value={
                    job.cust_code
                      ? <span className="font-mono text-cyan-400">{job.cust_code}</span>
                      : null
                  } />
                  <div className="col-span-2">
                    <Field label="Ship-To Address" value={fullAddress || null} />
                  </div>
                </dl>
              </div>

              {/* Order details */}
              <div className="rounded-xl bg-slate-900 border border-white/10 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5" /> Order Details
                </h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="Branch" value={BRANCH_LABELS[job.system_id] ?? job.system_id} />
                  <Field label="Sale Type" value={job.sale_type} />
                  <Field label="Reference" value={job.reference ? <span className="font-mono text-xs">{job.reference}</span> : null} />
                  <Field label="PO Number"  value={job.po_number  ? <span className="font-mono text-xs">{job.po_number}</span>  : null} />
                  <Field label="Ship Via"   value={job.ship_via} />
                  <Field label="Salesperson" value={job.salesperson} />
                  <Field label="Expect Date" value={
                    job.expect_date
                      ? <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-500" />{job.expect_date}</span>
                      : null
                  } />
                  <Field label="Delivery Method" value={
                    job.ship_via
                      ? <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-slate-500" />{job.ship_via}</span>
                      : null
                  } />
                </dl>
              </div>

              {/* GPS info */}
              <div className={cn(
                'rounded-xl border p-5',
                job.gps_matched
                  ? 'bg-cyan-950/30 border-cyan-500/20'
                  : 'bg-amber-950/20 border-amber-500/20'
              )}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                  {job.gps_matched
                    ? <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    : <MapPinOff className="w-3.5 h-3.5 text-amber-400" />
                  }
                  GPS Coordinates
                </h2>
                {job.gps_matched ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Latitude"  value={<span className="font-mono text-cyan-400">{job.lat?.toFixed(6)}</span>} />
                    <Field label="Longitude" value={<span className="font-mono text-cyan-400">{job.lon?.toFixed(6)}</span>} />
                    <Field label="Cust Key"     value={job.cust_key       ? <span className="font-mono text-xs text-slate-400">{job.cust_key}</span>       : null} />
                    <Field label="Ship-To Seq"  value={job.shipto_seq_num != null ? <span className="font-mono text-xs text-slate-400">{job.shipto_seq_num}</span> : null} />
                  </dl>
                ) : (
                  <p className="text-sm text-amber-400/80">
                    No GPS coordinates on file for this ship-to address in <code className="text-xs bg-slate-800 px-1 rounded">agility_customers</code>.
                    {job.cust_key && (
                      <span className="block mt-1 text-slate-500 text-xs">
                        Cust key: {job.cust_key} · Seq: {job.shipto_seq_num ?? '—'}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Map */}
            <div className="rounded-xl bg-slate-900 border border-white/10 overflow-hidden" style={{ minHeight: '420px' }}>
              {job.gps_matched && job.lat != null && job.lon != null ? (
                <div className="relative h-full" style={{ minHeight: '420px' }}>
                  <JobLocationMap
                    lat={job.lat}
                    lon={job.lon}
                    label={`SO ${job.so_id}`}
                    address={fullAddress}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 py-16">
                  <MapPinOff className="w-10 h-10 text-slate-700" />
                  <p className="text-sm font-medium">No GPS coordinates available</p>
                  <p className="text-xs text-center max-w-[220px]">
                    GPS coordinates are stored on the customer ship-to record in the ERP.
                    Contact an admin to update them.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
