export interface CreditMemo {
  so_id: string;
  system_id: string;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  so_status: string | null;
  salesperson: string | null;
  created_date: string | null;
  expect_date: string | null;
  address_1: string | null;
  city: string | null;
  doc_count: number;
  latest_doc_received: string | null;
}

export const ALLOWED_SORTS = [
  'so_id', 'cust_name', 'reference', 'city', 'so_status', 'system_id', 'doc_count', 'created_date',
] as const;
export type SortCol = typeof ALLOWED_SORTS[number];
