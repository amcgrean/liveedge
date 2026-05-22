// Dispatch a report-key to its digest renderer. Keeps the cron + CRUD layer
// agnostic of which reports exist.

import { renderSalesReportsDigest } from './digests/sales-reports';
import { renderDeliveryReportsDigest } from './digests/delivery-reports';
import { renderScorecardOverviewDigest } from './digests/scorecard-overview';
import {
  type ReportKey,
  type SalesReportsParams,
  type DeliveryReportsParams,
  type ScorecardOverviewParams,
} from './registry';

export interface RenderedDigest {
  buffer:     Buffer;
  filename:   string;
  mimeType:   string;
  highlights: Array<{ label: string; value: string }>;
  rangeLabel: string;
  isEmpty:    boolean;
}

export async function renderDigest(
  key:      ReportKey,
  params:   unknown,
  format:   'pdf' | 'excel',
  generatedAt: Date,
): Promise<RenderedDigest> {
  switch (key) {
    case 'sales-reports':
      return renderSalesReportsDigest({ params: params as SalesReportsParams, format, generatedAt });
    case 'delivery-reports':
      return renderDeliveryReportsDigest({ params: params as DeliveryReportsParams, format, generatedAt });
    case 'scorecard-overview':
      return renderScorecardOverviewDigest({ params: params as ScorecardOverviewParams, format, generatedAt });
  }
}
