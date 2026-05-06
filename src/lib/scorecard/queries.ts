import { getErpSql } from '../../../db/supabase';
import { erpCache } from '../erp-cache';
import type {
  ScorecardParams,
  AggregateParams,
  KpiComparison,
  KpiSet,
  CustomerAvg,
  ProductMajorRow,
  ProductMinorRow,
  ProductItemRow,
  ProductOrderRow,
  ProductScorecardMajorRow,
  ProductScorecardMinorRow,
  ProductScorecardItemRow,
  SaleTypeRow,
  ThreeYearEntry,
  DaysToPayData,
  CustomerListRow,
  BranchSummaryRow,
  RepListRow,
} from './types';
