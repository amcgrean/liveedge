'use server';

import { getErpSql } from '@/db/supabase';

export type RebateProgramRow = {
  id: number;
  supplierKey: string;
  supplierName: string;
  programName: string;
  programType: 'volume_tier' | 'growth' | 'mix_attach' | 'other';
  periodStart: string;
  periodEnd: string;
  targetAmount: number | null;
  rebateRatePct: number | null;
  rebateAmountFlat: number | null;
  productGroup: string | null;
  payoutTiming: string;
  milestoneLabel: string | null;
  tierBreakpoints: { threshold: number; rate_pct: number }[] | null;
  isActive: boolean;
  createdAt: string;
};

export type VendorOption = { key: string; name: string; code: string };

export type ProgramInput = {
  supplierKey: string;
  programName: string;
  programType: string;
  periodStart: string;
  periodEnd: string;
  targetAmount: number | null;
  rebateRatePct: number | null;
  rebateAmountFlat: number | null;
  productGroup: string | null;
  payoutTiming: string;
  milestoneLabel: string | null;
  tierBreakpoints: { threshold: number; rate_pct: number }[] | null;
  isActive: boolean;
};

export async function fetchRebatePrograms(): Promise<RebateProgramRow[]> {
  const sql = getErpSql();
  type Row = {
    id: number;
    supplier_key: string;
    supplier_name: string;
    program_name: string;
    program_type: string;
    period_start: string;
    period_end: string;
    target_amount: string | null;
    rebate_rate_pct: string | null;
    rebate_amount_flat: string | null;
    product_group: string | null;
    payout_timing: string;
    milestone_label: string | null;
    tier_breakpoints: { threshold: number; rate_pct: number }[] | null;
    is_active: boolean;
    created_at: string;
  };
  const rows = await sql<Row[]>`
    SELECT
      p.id,
      p.supplier_key,
      COALESCE(s.supplier_name, p.supplier_key) AS supplier_name,
      p.program_name,
      p.program_type,
      p.period_start::text,
      p.period_end::text,
      p.target_amount::text,
      p.rebate_rate_pct::text,
      p.rebate_amount_flat::text,
      p.product_group,
      p.payout_timing,
      p.milestone_label,
      p.tier_breakpoints,
      p.is_active,
      p.created_at::text
    FROM supplier_rebate_programs p
    LEFT JOIN LATERAL (
      SELECT MAX(supplier_name) AS supplier_name
      FROM agility_po_header
      WHERE supplier_key = p.supplier_key AND is_deleted = false
    ) s ON true
    ORDER BY p.is_active DESC, p.created_at DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    supplierKey: r.supplier_key,
    supplierName: r.supplier_name,
    programName: r.program_name,
    programType: r.program_type as RebateProgramRow['programType'],
    periodStart: r.period_start,
    periodEnd: r.period_end,
    targetAmount: r.target_amount != null ? Number(r.target_amount) : null,
    rebateRatePct: r.rebate_rate_pct != null ? Number(r.rebate_rate_pct) : null,
    rebateAmountFlat: r.rebate_amount_flat != null ? Number(r.rebate_amount_flat) : null,
    productGroup: r.product_group,
    payoutTiming: r.payout_timing,
    milestoneLabel: r.milestone_label,
    tierBreakpoints: r.tier_breakpoints,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function fetchVendorOptions(): Promise<VendorOption[]> {
  const sql = getErpSql();
  const rows = await sql<{ supplier_key: string; supplier_name: string; supplier_code: string }[]>`
    SELECT
      supplier_key,
      MAX(supplier_name) AS supplier_name,
      MAX(supplier_code) AS supplier_code
    FROM agility_po_header
    WHERE is_deleted = false
      AND supplier_key IS NOT NULL AND supplier_key <> ''
    GROUP BY supplier_key
    ORDER BY MAX(supplier_name)
    LIMIT 500
  `;
  return rows.map((r) => ({
    key: r.supplier_key,
    name: r.supplier_name ?? r.supplier_key,
    code: r.supplier_code ?? '',
  }));
}

export async function fetchProductGroupOptions(): Promise<string[]> {
  const sql = getErpSql();
  const rows = await sql<{ pg: string }[]>`
    SELECT DISTINCT link_product_group AS pg
    FROM agility_items
    WHERE is_deleted = false
      AND link_product_group IS NOT NULL AND link_product_group <> ''
    ORDER BY link_product_group
    LIMIT 100
  `;
  return rows.map((r) => r.pg);
}

export async function createRebateProgram(input: ProgramInput): Promise<{ id: number }> {
  const sql = getErpSql();
  const rows = await sql<{ id: number }[]>`
    INSERT INTO supplier_rebate_programs (
      supplier_key, program_name, program_type,
      period_start, period_end,
      target_amount, rebate_rate_pct, rebate_amount_flat,
      product_group, payout_timing, milestone_label,
      tier_breakpoints, is_active
    ) VALUES (
      ${input.supplierKey},
      ${input.programName},
      ${input.programType},
      ${input.periodStart}::date,
      ${input.periodEnd}::date,
      ${input.targetAmount},
      ${input.rebateRatePct},
      ${input.rebateAmountFlat},
      ${input.productGroup},
      ${input.payoutTiming},
      ${input.milestoneLabel},
      ${input.tierBreakpoints != null ? JSON.stringify(input.tierBreakpoints) : null}::jsonb,
      ${input.isActive}
    )
    RETURNING id
  `;
  return { id: rows[0].id };
}

export async function updateRebateProgram(id: number, input: ProgramInput): Promise<void> {
  const sql = getErpSql();
  await sql`
    UPDATE supplier_rebate_programs SET
      supplier_key       = ${input.supplierKey},
      program_name       = ${input.programName},
      program_type       = ${input.programType},
      period_start       = ${input.periodStart}::date,
      period_end         = ${input.periodEnd}::date,
      target_amount      = ${input.targetAmount},
      rebate_rate_pct    = ${input.rebateRatePct},
      rebate_amount_flat = ${input.rebateAmountFlat},
      product_group      = ${input.productGroup},
      payout_timing      = ${input.payoutTiming},
      milestone_label    = ${input.milestoneLabel},
      tier_breakpoints   = ${input.tierBreakpoints != null ? JSON.stringify(input.tierBreakpoints) : null}::jsonb,
      is_active          = ${input.isActive},
      updated_at         = now()
    WHERE id = ${id}
  `;
}

export async function toggleRebateProgram(id: number, isActive: boolean): Promise<void> {
  const sql = getErpSql();
  await sql`
    UPDATE supplier_rebate_programs
    SET is_active = ${isActive}, updated_at = now()
    WHERE id = ${id}
  `;
}
