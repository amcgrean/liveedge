'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import SubscriptionModal from './SubscriptionModal';
import type { ReportKey } from '@/lib/reports/registry';

export interface SubscribeButtonProps {
  reportKey:     ReportKey;
  reportLabel:   string;
  paramsSummary: string;
  /** Current filter values as a plain object. Sent verbatim to the API. */
  params:        Record<string, unknown>;
  className?:    string;
}

export default function SubscribeButton(props: SubscribeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          props.className ??
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-slate-600 bg-slate-800 text-slate-200 hover:border-cyan-500 hover:text-white'
        }
        title="Subscribe to this report"
      >
        <Mail size={14} />
        Subscribe
      </button>
      {open && (
        <SubscriptionModal
          reportKey={props.reportKey}
          reportLabel={props.reportLabel}
          paramsSummary={props.paramsSummary}
          params={props.params}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
