// POST /api/admin/hubbell/documents/ai-review
//
// AI-assisted review of pending Hubbell-doc → Agility-SO match suggestions.
// For each doc with pending suggestions, fetches the PDF from R2, sends it to
// Claude with the candidate SOs, parses the model's per-candidate decisions,
// and updates the suggestion queue + hubbell_document_sos accordingly.
//
// Auth: user session with hubbell.review capability (called from the admin UI).
// Also accepts Bearer $HUBBELL_UPLOAD_TOKEN for service-to-service use.
//
// Body:
//   {
//     "limit": 5,           // docs per call (default 5, max 20 — capped by maxDuration)
//     "doc_ids": ["uuid",…] // optional: restrict to specific docs
//   }
//
// Response: {
//   processed: number,
//   suggestions_evaluated: number,
//   accepted: number,
//   rejected: number,
//   skipped: number,
//   errors: [{ doc_id, error }],
//   run_id: string
// }

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql as dsql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../db/index';
import { downloadPdf } from '../../../../../../src/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Suggestion = {
  id: string;
  document_id: string;
  so_id: number;
  cust_code: string | null;
  match_source: string;
  confidence: number;
  match_reasons: string[];
  // Doc fields
  doc_type: string;
  doc_number: string;
  r2_key: string;
  extracted_address: string | null;
  extracted_city: string | null;
  extracted_state: string | null;
  extracted_zip: string | null;
  extracted_total: string | null;
  dev_code: string | null;
  house_number: string | null;
  block_lot: string | null;
  // SO fields
  so_cust_code: string | null;
  so_cust_name: string | null;
  so_reference: string | null;
  so_po_number: string | null;
  so_shipto_address: string | null;
  so_shipto_city: string | null;
  so_shipto_state: string | null;
  so_shipto_zip: string | null;
  so_status: string | null;
  so_expect_date: string | null;
};

type AiDecision = {
  suggestion_id: string;
  action: 'accept' | 'reject' | 'skip';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
};

type AiResponse = {
  decisions: AiDecision[];
};

const SYSTEM_PROMPT = `You are reviewing match candidates between Hubbell construction PO/WO documents and Beisser Lumber's Agility ERP sales orders.

Your task: for each candidate Agility sales order paired with a Hubbell document, decide whether they refer to the same physical jobsite + scope of work.

You will be given:
1. A Hubbell PO or WO PDF (visual document)
2. The structured fields the system already extracted from that PDF
3. A list of candidate Agility sales orders, each with shipto address, customer code, and status

For each candidate, output exactly one decision:
- "accept": The doc and SO clearly refer to the same jobsite (address match) AND the same logical scope (e.g. both are framing-stage, or both are trim-stage). High confidence required.
- "reject": The doc and SO clearly do NOT match — different address, different city, different scope (e.g. doc is for warranty, SO is for new build), or the SO is for a different Hubbell entity that doesn't make sense.
- "skip": Genuine ambiguity — partial address match, same street different number, missing data on one side. Leave for human review.

Key matching signals (in priority order):
1. **Street address** — the most important signal. Exact match (after normalizing "Ave" vs "Avenue", "St" vs "Street") = strong accept signal. Different street numbers on the same street = reject.
2. **City/state/zip** — supporting signals. Wrong city is always a reject.
3. **Customer code** — Hubbell entities: HUBB1200 (main construction), HUBB1700 (trim/millwork), HUBB1000, HUBB1400. A WO doc usually matches a trim-stage SO; a PO matches main-construction.
4. **Dev code / house number** — if the PDF shows a dev code (e.g. "WT") and house number, prefer SOs whose reference/PO fields also reference that house.
5. **Document totals vs SO totals** — large mismatches are a yellow flag, not a hard reject (one might be partial billing).

Be cautious. False positives (accepting a wrong match) corrupt accounting records. Skip when in doubt. The bar for accept is "I'd stake my reputation on this match", not "probably right".

Output your decisions as JSON matching the provided schema.`;

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          suggestion_id: { type: 'string' },
          action: { type: 'string', enum: ['accept', 'reject', 'skip'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reasoning: { type: 'string', description: 'One or two sentences explaining the decision.' },
        },
        required: ['suggestion_id', 'action', 'confidence', 'reasoning'],
        additionalProperties: false,
      },
    },
  },
  required: ['decisions'],
  additionalProperties: false,
};

export async function POST(req: NextRequest) {
  // Dual auth: bearer for service, session for browser UI
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  let reviewer: string;
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
    reviewer = 'ai_review:service';
  } else {
    const auth = await requireCapability('hubbell.review');
    if (auth instanceof NextResponse) return auth;
    reviewer = `ai_review:${auth.user?.name ?? auth.user?.email ?? 'unknown'}`;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 },
    );
  }

  let body: { limit?: unknown; doc_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const limit = Math.min(Math.max(1, Number(body.limit ?? 5) || 5), 20);
  const docIds = Array.isArray(body.doc_ids)
    ? body.doc_ids.filter((x): x is string => typeof x === 'string')
    : null;

  const runId = `ai_review_${new Date().toISOString().replace(/[:.]/g, '_')}`;
  const db = getDb();

  // Pull pending suggestions joined with doc + SO. Group by document_id so we
  // call Claude once per doc (with all its candidates in one prompt).
  const docFilter =
    docIds && docIds.length > 0
      ? dsql`AND s.document_id IN (${dsql.join(
          docIds.map((id) => dsql`${id}::uuid`),
          dsql`, `,
        )})`
      : dsql``;

  const rowsRaw = await db.execute(dsql`
    SELECT
      s.id::text                       AS id,
      s.document_id::text              AS document_id,
      s.so_id,
      s.cust_code,
      s.match_source,
      s.confidence,
      s.match_reasons,
      d.doc_type,
      d.doc_number,
      d.r2_key,
      d.extracted_address,
      d.extracted_city,
      d.extracted_state,
      d.extracted_zip,
      d.extracted_total::text          AS extracted_total,
      d.dev_code,
      d.house_number,
      d.block_lot,
      TRIM(soh.cust_code)              AS so_cust_code,
      soh.cust_name                    AS so_cust_name,
      soh.reference                    AS so_reference,
      soh.po_number                    AS so_po_number,
      soh.shipto_address_1             AS so_shipto_address,
      soh.shipto_city                  AS so_shipto_city,
      soh.shipto_state                 AS so_shipto_state,
      soh.shipto_zip                   AS so_shipto_zip,
      soh.so_status                    AS so_status,
      soh.expect_date::text            AS so_expect_date
    FROM bids.hubbell_document_suggestions s
    JOIN bids.hubbell_documents d ON d.id = s.document_id
    LEFT JOIN public.agility_so_header soh
      ON soh.so_id = s.so_id AND soh.is_deleted = false
    WHERE s.status = 'pending'
    ${docFilter}
    ORDER BY s.document_id, s.confidence DESC, s.suggested_at DESC
  `);

  const rows: Suggestion[] = Array.isArray(rowsRaw)
    ? (rowsRaw as unknown as Suggestion[])
    : ((rowsRaw as { rows?: Suggestion[] }).rows ?? []);

  // Group by document_id, keep only first `limit` distinct docs
  const byDoc = new Map<string, Suggestion[]>();
  for (const r of rows) {
    if (!byDoc.has(r.document_id) && byDoc.size >= limit) continue;
    const arr = byDoc.get(r.document_id) ?? [];
    arr.push(r);
    byDoc.set(r.document_id, arr);
  }

  const client = new Anthropic();

  let processedDocs = 0;
  let evaluated = 0;
  let accepted = 0;
  let rejected = 0;
  let skipped = 0;
  const errors: Array<{ doc_id: string; error: string }> = [];

  for (const [documentId, suggestions] of byDoc.entries()) {
    if (suggestions.length === 0) continue;
    const doc = suggestions[0]; // shared doc fields

    try {
      // Fetch PDF from R2
      const pdfBytes = await downloadPdf(doc.r2_key);
      const pdfBase64 = pdfBytes.toString('base64');

      // Build the user message with PDF + extracted fields + candidates
      const candidatesBlock = suggestions
        .map(
          (s, i) => `Candidate ${i + 1} (suggestion_id: ${s.id}):
  SO #: ${s.so_id}
  Customer: ${s.so_cust_code ?? '?'} ${s.so_cust_name ?? ''}
  Reference: ${s.so_reference ?? '(none)'}
  PO field: ${s.so_po_number ?? '(empty)'}
  Shipto: ${s.so_shipto_address ?? '(none)'}, ${s.so_shipto_city ?? '?'} ${s.so_shipto_state ?? ''} ${s.so_shipto_zip ?? ''}
  SO status: ${s.so_status ?? '?'} | Expected: ${s.so_expect_date ?? '?'}
  Server-side match signal: ${s.match_source} (confidence ${s.confidence})
  Reasons: ${s.match_reasons.join('; ') || '(none)'}`,
        )
        .join('\n\n');

      const docFields = `Hubbell document being reviewed:
  Type: ${doc.doc_type.toUpperCase()}
  Number: ${doc.doc_number}
  Extracted address: ${doc.extracted_address ?? '(missing)'}, ${doc.extracted_city ?? '?'} ${doc.extracted_state ?? ''} ${doc.extracted_zip ?? ''}
  Extracted total: ${doc.extracted_total ?? '?'}
  Dev code: ${doc.dev_code ?? '(none)'} | House #: ${doc.house_number ?? '?'} | Lot: ${doc.block_lot ?? '?'}`;

      const response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        output_config: {
          format: {
            type: 'json_schema',
            schema: DECISION_SCHEMA,
          },
        },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
              },
              {
                type: 'text',
                text: `${docFields}

Candidate sales orders (${suggestions.length} total):

${candidatesBlock}

For each candidate, output a decision in the required JSON schema. Use the PDF as the source of truth — the extracted fields may be missing or wrong.`,
              },
            ],
          },
        ],
      });

      // Parse the structured output
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('no text block in response');
      }
      const parsed: AiResponse = JSON.parse(textBlock.text);
      if (!Array.isArray(parsed.decisions)) {
        throw new Error('invalid response shape');
      }

      // Apply each decision in a single transaction per doc.
      const docTouched = new Set<string>();
      await db.transaction(async (tx) => {
        for (const decision of parsed.decisions) {
          const suggestion = suggestions.find((s) => s.id === decision.suggestion_id);
          if (!suggestion) continue;
          evaluated++;

          // Only act on high/medium-confidence decisions. Low confidence stays
          // pending for human review (effectively a "skip").
          const effectiveAction =
            decision.confidence === 'low' && decision.action !== 'reject'
              ? 'skip'
              : decision.action;

          if (effectiveAction === 'accept') {
            // Insert into hubbell_document_sos (skip if already exists)
            const existing = await tx
              .select({ id: schema.hubbellDocumentSos.id })
              .from(schema.hubbellDocumentSos)
              .where(
                and(
                  eq(schema.hubbellDocumentSos.documentId, suggestion.document_id),
                  eq(schema.hubbellDocumentSos.soId, suggestion.so_id),
                ),
              )
              .limit(1);
            if (existing.length === 0) {
              await tx.insert(schema.hubbellDocumentSos).values({
                documentId: suggestion.document_id,
                soId: suggestion.so_id,
                custCode: suggestion.cust_code,
                matchSource: `ai_${suggestion.match_source}`,
                confidence: suggestion.confidence,
                matchReasons: [...suggestion.match_reasons, `ai: ${decision.reasoning}`],
                confirmedBy: reviewer,
                confirmedAt: dsql`now()`,
              });
            }
            await tx
              .update(schema.hubbellDocumentSuggestions)
              .set({
                status: 'accepted',
                reviewedBy: reviewer,
                reviewedAt: dsql`now()`,
                matchReasons: [
                  ...suggestion.match_reasons,
                  `ai_${decision.confidence}: ${decision.reasoning}`,
                ],
              })
              .where(eq(schema.hubbellDocumentSuggestions.id, suggestion.id));
            accepted++;
            docTouched.add(suggestion.document_id);
          } else if (effectiveAction === 'reject') {
            await tx
              .update(schema.hubbellDocumentSuggestions)
              .set({
                status: 'rejected',
                reviewedBy: reviewer,
                reviewedAt: dsql`now()`,
                matchReasons: [
                  ...suggestion.match_reasons,
                  `ai_${decision.confidence}: ${decision.reasoning}`,
                ],
              })
              .where(eq(schema.hubbellDocumentSuggestions.id, suggestion.id));
            rejected++;
          } else {
            // skip — leave pending, just annotate
            await tx
              .update(schema.hubbellDocumentSuggestions)
              .set({
                matchReasons: [
                  ...suggestion.match_reasons,
                  `ai_${decision.confidence}_skip: ${decision.reasoning}`,
                ],
              })
              .where(eq(schema.hubbellDocumentSuggestions.id, suggestion.id));
            skipped++;
          }
        }

        // Bump doc match_status if anything was accepted
        for (const docId of docTouched) {
          await tx.execute(dsql`
            UPDATE bids.hubbell_documents
               SET match_status = 'confirmed', updated_at = now()
             WHERE id = ${docId}::uuid
               AND match_status IN ('unmatched','auto_matched')
          `);
        }
      });

      processedDocs++;
    } catch (err) {
      errors.push({
        doc_id: documentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    run_id: runId,
    processed: processedDocs,
    suggestions_evaluated: evaluated,
    accepted,
    rejected,
    skipped,
    errors,
  });
}
