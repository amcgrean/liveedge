// Hubbell match-label corpus helper.
//
// Upserts a training label for a (document, SO) pair into
// bids.hubbell_match_labels, keyed (document_id, so_id, source). Used by:
//   - POST /api/admin/hubbell/labels — the batch write endpoint the
//     cash-application streamlit translator POSTs to.
//   - POST /api/admin/hubbell/suggestions/[id]/review — captures the
//     reviewer's rationale alongside the accept/reject decision.
//
// The label write is intentionally NOT part of the suggestion-review
// transaction: it is provenance/training data and must never roll back a
// real accept. Callers write it after the operational write commits.
//
// Schema hygiene: pure intra-Hubbell. Designed for the eventual
// `bids → hubbell` schema rename.

import { sql as dsql } from 'drizzle-orm';
import type { getDb } from '../../../db/index';
import { schema } from '../../../db/index';

type Db = ReturnType<typeof getDb>;

export type MatchLabelAction = 'accept' | 'reject' | 'skip';
export type MatchLabelConfidence = 'high' | 'medium' | 'low';

export type MatchLabelInput = {
  documentId: string;
  soId: number;
  label: MatchLabelAction;
  source: string;
  reasonCode?: string | null;
  signals?: unknown;
  confidence?: MatchLabelConfidence | null;
  reasoning?: string | null;
  reviewer?: string | null;
  applyAmount?: number | string | null;
  suggestionId?: string | null;
};

function normalizeAmount(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? String(n) : null;
}

// Upsert one label. Idempotent on (document_id, so_id, source) — re-submitting
// overwrites the prior viewpoint for that loop and bumps updated_at.
export async function upsertMatchLabel(db: Db, input: MatchLabelInput): Promise<void> {
  await db
    .insert(schema.hubbellMatchLabels)
    .values({
      documentId: input.documentId,
      soId: input.soId,
      label: input.label,
      source: input.source,
      reasonCode: input.reasonCode ?? null,
      signals: input.signals ?? null,
      confidence: input.confidence ?? null,
      reasoning: input.reasoning ?? null,
      reviewer: input.reviewer ?? null,
      applyAmount: normalizeAmount(input.applyAmount),
      suggestionId: input.suggestionId ?? null,
    })
    .onConflictDoUpdate({
      target: [
        schema.hubbellMatchLabels.documentId,
        schema.hubbellMatchLabels.soId,
        schema.hubbellMatchLabels.source,
      ],
      set: {
        label: input.label,
        reasonCode: input.reasonCode ?? null,
        signals: input.signals ?? null,
        confidence: input.confidence ?? null,
        reasoning: input.reasoning ?? null,
        reviewer: input.reviewer ?? null,
        applyAmount: normalizeAmount(input.applyAmount),
        suggestionId: input.suggestionId ?? null,
        updatedAt: dsql`now()`,
      },
    });
}

export const VALID_LABEL_ACTIONS: ReadonlySet<string> = new Set([
  'accept',
  'reject',
  'skip',
]);
export const VALID_CONFIDENCE: ReadonlySet<string> = new Set([
  'high',
  'medium',
  'low',
]);
