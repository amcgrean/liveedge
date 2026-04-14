/**
 * Agility API Client
 *
 * Wraps the DMSi AgilityPublic REST API (v619).
 * All endpoints are POST-based RPC with JSON payloads.
 * Each request requires a ContextId + Branch obtained from Login.
 *
 * Architecture:
 *  - Sessions are cached per-branch in module memory (survives warm Vercel instances).
 *  - Cold starts / token expiry (4h default) trigger an automatic re-login.
 *  - A 401 response from any call triggers one re-login attempt before failing.
 *
 * Usage:
 *   import { agilityApi } from '@/lib/agility-api'
 *   const result = await agilityApi.call('Inventory', 'ItemPriceAndAvailabilityList', { ... })
 *
 * Env vars required:
 *   AGILITY_API_URL      — full base URL including path, e.g. https://api-1390-1.dmsi.com/AgilityPublic/rest/
 *   AGILITY_USERNAME     — Agility user with API access. IMPORTANT: must include company domain suffix
 *                          e.g. "leapi.beisser" (NOT "leapi") — the Agility server requires the full
 *                          domain-qualified username, the same format used by mobile/app logins.
 *   AGILITY_PASSWORD     — password for that user
 *   AGILITY_BRANCH       — default branch code (e.g. "20GR") — optional, falls back to login default
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class AgilityApiError extends Error {
  constructor(
    message: string,
    public readonly returnCode: number,
    public readonly service?: string,
    public readonly method?: string
  ) {
    super(message);
    this.name = 'AgilityApiError';
  }
}

export class AgilityAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgilityAuthError';
  }
}

interface AgilitySession {
  contextId: string;
  branch: string;       // Agility internal branch ID (not Beisser's code like "20GR")
  loginBranch: string;  // The branch the user logged into
  expiresAt: number;    // ms epoch — 4h from login, we use 3.5h to be safe
}

interface LoginResponse {
  response: {
    SessionContextId: string;
    InitialBranch: string;
    ReturnCode: number;
    MessageText: string;
  };
}

export interface AgilityResponse<T = Record<string, unknown>> {
  response: T & {
    ReturnCode: number;
    MessageText: string;
  };
}

// ---------------------------------------------------------------------------
// Branch mapping
// Beisser's ERP branch codes → Agility branch IDs.
// These need to be confirmed once you have access to BranchList.
// ---------------------------------------------------------------------------

/**
 * Map of Beisser branch codes to Agility branch IDs.
 * Verified via BranchList call — all four branches use identity mapping.
 */
export const BRANCH_MAP: Record<string, string> = {
  '10FD': '10FD', // Fort Dodge
  '20GR': '20GR', // Grimes
  '25BW': '25BW', // Waukee
  '40CV': '40CV', // Coralville
};

// ---------------------------------------------------------------------------
// Session cache (module-level — survives warm Lambda/Edge instances)
// ---------------------------------------------------------------------------

/** One cached session per branch code. Re-login happens on cold start or expiry. */
const _sessionCache = new Map<string, AgilitySession>();

const SESSION_TTL_MS = 3.5 * 60 * 60 * 1000; // 3.5 hours (Agility default is 4h)

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getConfig(): { baseUrl: string; username: string; password: string; defaultBranch: string } {
  const baseUrl = process.env.AGILITY_API_URL;
  const username = process.env.AGILITY_USERNAME;
  const password = process.env.AGILITY_PASSWORD;
  const defaultBranch = process.env.AGILITY_BRANCH ?? '';

  if (!baseUrl || !username || !password) {
    throw new AgilityAuthError(
      'Agility API not configured. ' +
        'Required env vars: AGILITY_API_URL, AGILITY_USERNAME, AGILITY_PASSWORD'
    );
  }

  // Ensure base URL ends with /
  return {
    baseUrl: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    username,
    password,
    defaultBranch,
  };
}

function isSessionValid(session: AgilitySession): boolean {
  return Date.now() < session.expiresAt;
}

// ---------------------------------------------------------------------------
// Login / session management
// ---------------------------------------------------------------------------

/**
 * Authenticate with the Agility API and cache the session for the given branch.
 * Branch is the Agility internal branch ID — leave blank to use the user's default.
 */
async function login(branchKey: string = ''): Promise<AgilitySession> {
  const { baseUrl, username, password } = getConfig();

  // AGILITY_API_URL already includes /AgilityPublic/rest/ — append method directly
  const url = `${baseUrl}Session/Login`;

  const body = {
    request: {
      LoginID: username,
      Password: password,
      ...(branchKey ? { Branch: branchKey } : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AgilityAuthError(
      `Agility Login network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    throw new AgilityAuthError(
      `Agility Login failed with HTTP ${res.status}: ${await res.text().catch(() => '')}`
    );
  }

  let data: LoginResponse;
  try {
    data = (await res.json()) as LoginResponse;
  } catch {
    throw new AgilityAuthError('Agility Login returned invalid JSON');
  }

  const { SessionContextId, InitialBranch, ReturnCode, MessageText } = data.response;

  if (ReturnCode !== 0) {
    throw new AgilityAuthError(`Agility Login error (RC ${ReturnCode}): ${MessageText}`);
  }

  if (!SessionContextId) {
    throw new AgilityAuthError('Agility Login succeeded but returned no SessionContextId');
  }

  const session: AgilitySession = {
    contextId: SessionContextId,
    branch: InitialBranch,
    loginBranch: branchKey || InitialBranch,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  _sessionCache.set(branchKey || InitialBranch, session);
  return session;
}

/**
 * Get a valid session for the given branch, logging in if needed.
 */
async function getSession(branchKey: string = ''): Promise<AgilitySession> {
  const cacheKey = branchKey || '_default';
  const cached = _sessionCache.get(cacheKey);

  if (cached && isSessionValid(cached)) {
    return cached;
  }

  // Cache miss or expired — re-authenticate
  return login(branchKey);
}

/**
 * Invalidate cached session for a branch (called on 401 responses).
 */
function invalidateSession(branchKey: string): void {
  _sessionCache.delete(branchKey || '_default');
}

// ---------------------------------------------------------------------------
// Core API caller
// ---------------------------------------------------------------------------

/**
 * Make an authenticated POST call to the AgilityPublic REST API.
 *
 * Automatically handles:
 *  - Session acquisition and caching
 *  - One re-login on 401 (expired token)
 *  - ReturnCode != 0 mapped to AgilityApiError
 *
 * @param service  - Agility service name, e.g. "Inventory", "Orders", "Customer"
 * @param method   - Method name, e.g. "ItemPriceAndAvailabilityList"
 * @param body     - Request body (will be wrapped in { request: ... })
 * @param options  - Optional: { branch } to target a specific branch session
 */
async function callApi<T = Record<string, unknown>>(
  service: string,
  method: string,
  body: object,
  options: { branch?: string; retrying?: boolean } = {}
): Promise<T & { ReturnCode: number; MessageText: string }> {
  const { baseUrl } = getConfig();
  const branchKey = options.branch ?? '';

  const session = await getSession(branchKey);

  // AGILITY_API_URL already includes /AgilityPublic/rest/ — append service/method directly
  const url = `${baseUrl}${service}/${method}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ContextId: session.contextId,
        Branch: session.branch,
      },
      body: JSON.stringify({ request: body }),
    });
  } catch (err) {
    throw new AgilityApiError(
      `${service}/${method} network error: ${err instanceof Error ? err.message : String(err)}`,
      -1,
      service,
      method
    );
  }

  // 401 = session expired — invalidate + retry once
  if (res.status === 401 && !options.retrying) {
    invalidateSession(branchKey);
    return callApi(service, method, body, { ...options, retrying: true });
  }

  if (!res.ok) {
    throw new AgilityApiError(
      `${service}/${method} HTTP ${res.status}: ${await res.text().catch(() => '')}`,
      -1,
      service,
      method
    );
  }

  let data: AgilityResponse<T>;
  try {
    data = (await res.json()) as AgilityResponse<T>;
  } catch {
    throw new AgilityApiError(
      `${service}/${method} returned invalid JSON`,
      -1,
      service,
      method
    );
  }

  const { ReturnCode, MessageText } = data.response as { ReturnCode: number; MessageText: string };

  // ReturnCode 1 = warning (log but continue), 2 = error (throw)
  if (ReturnCode === 2) {
    throw new AgilityApiError(
      `${service}/${method} error: ${MessageText}`,
      ReturnCode,
      service,
      method
    );
  }

  if (ReturnCode === 1) {
    console.warn(`[AgilityAPI] ${service}/${method} warning (RC 1): ${MessageText}`);
  }

  return data.response as T & { ReturnCode: number; MessageText: string };
}

// ---------------------------------------------------------------------------
// Session service helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the Agility API is configured in env vars.
 */
export function isAgilityConfigured(): boolean {
  return !!(
    process.env.AGILITY_API_URL &&
    process.env.AGILITY_USERNAME &&
    process.env.AGILITY_PASSWORD
  );
}

/**
 * Fetch all branches available to the logged-in user.
 * Use this once to verify/update the BRANCH_MAP above.
 */
async function fetchBranchList(options: { branch?: string } = {}): Promise<BranchListItem[]> {
  const res = await callApi<{ dsBranchList: { dtBranchList: BranchListItem[] } }>(
    'Session',
    'BranchList',
    {},
    options
  );
  return res.dsBranchList?.dtBranchList ?? [];
}

/**
 * Get the Agility version string.
 */
async function fetchVersion(): Promise<string> {
  const res = await callApi<{ AgilityVersion: string }>('Session', 'AgilityVersion', {});
  return res.AgilityVersion ?? 'unknown';
}

/**
 * Explicit logout — clears server-side session and local cache.
 */
async function logout(branchKey: string = ''): Promise<void> {
  const cacheKey = branchKey || '_default';
  const cached = _sessionCache.get(cacheKey);
  if (!cached) return;

  try {
    await callApi('Session', 'Logout', {}, { branch: branchKey });
  } catch {
    // Best-effort logout
  } finally {
    _sessionCache.delete(cacheKey);
  }
}

// ---------------------------------------------------------------------------
// Inventory service
// ---------------------------------------------------------------------------

export interface ItemPriceAndAvailabilityRequest {
  CustomerID: string;
  ShipToSequence: number;
  SaleType: string;
  Items: {
    ItemID: string;
    Quantity: number;
    UOM?: string;
  }[];
}

// Field names confirmed from Postman v619 collection
export interface ItemPriceAvailResult {
  ItemCode: string;
  ItemDescription: string;
  UOM: string;
  GrossPrice: number;
  NetPrice: number;
  OnHandQuantity: number;
  AvailableQuantity: number;
  OnOrderQty: number;
  HandlingCode: string;
  NonSaleable: boolean;
  Stock: boolean;
  Discontinued: string;
}

/**
 * Real-time price and availability check for items.
 * Use this at bid pricing time instead of the stale agility_items mirror.
 */
async function itemPriceAndAvailability(
  request: ItemPriceAndAvailabilityRequest,
  options: { branch?: string } = {}
): Promise<ItemPriceAvailResult[]> {
  const res = await callApi<{
    ItemPriceAndAvailResponse: {
      dsItemPriceAndAvailResponse: { dtItemPriceAndAvailResponse: ItemPriceAvailResult[] };
    };
  }>('Inventory', 'ItemPriceAndAvailabilityList', request, options);
  return res.ItemPriceAndAvailResponse?.dsItemPriceAndAvailResponse?.dtItemPriceAndAvailResponse ?? [];
}

/**
 * Search items from the ERP (paginated via chunking).
 */
export interface ItemsListRequest {
  FetchOnlyChangedSince?: string; // yyyy-mm-ddThh:mm:ss
  RecordFetchLimit?: number;
  ChunkStartPointer?: number;
  ActiveOnly?: boolean;
  ItemID?: string;
}

// Field names confirmed from Postman v619 collection
export interface AgilityItem {
  ItemCode: string;
  ItemDescription: string;
  UOM: string;
  HandlingCode: string;
  Stock: boolean;
  Discontinued: string;
  GrossPrice: number;
  NetPrice: number;
  OnHandQuantity: number;
  AvailableQuantity: number;
  PrimarySupplierID: string;
}

async function itemsList(
  request: ItemsListRequest = {},
  options: { branch?: string } = {}
): Promise<{ items: AgilityItem[]; moreAvailable: boolean; nextPointer: number }> {
  const res = await callApi<{
    ItemsListResponse: { dsItemsListResponse: { dtItemsListResponse: AgilityItem[] } };
    MoreResultsAvailable: boolean;
    NextChunkStartPointer: number;
  }>('Inventory', 'ItemsList', { RecordFetchLimit: 200, ...request }, options);

  return {
    items: res.ItemsListResponse?.dsItemsListResponse?.dtItemsListResponse ?? [],
    moreAvailable: res.MoreResultsAvailable ?? false,
    nextPointer: res.NextChunkStartPointer ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Orders service
// ---------------------------------------------------------------------------

// Field names confirmed from Postman v619 collection
export interface SalesOrderHeader {
  OrderID: number;
  BranchID: string;
  CustomerID: string;
  ShipToSequence: number;
  SaleType: string;
  OrderDate: string;
  ExpectedDate: string | null;
  OrderStatus: string;
  TransactionReference: string;
  ShipVia: string;
  RouteID: string;
  OrderTotal: number;
  ShipToName: string | null;
  ShipToCity: string | null;
  ShipToState: string | null;
}

export interface SalesOrderListRequest {
  CustomerID?: string;
  Status?: string;
  StartDate?: string;
  EndDate?: string;
  RecordFetchLimit?: number;
  ChunkStartPointer?: number;
  FetchOnlyChangedSince?: string;
}

async function salesOrderList(
  request: SalesOrderListRequest = {},
  options: { branch?: string } = {}
): Promise<{ orders: SalesOrderHeader[]; moreAvailable: boolean; nextPointer: number }> {
  const res = await callApi<{
    OrdersResponse: { dsOrdersResponse: { dtOrderResponse: SalesOrderHeader[] } };
    MoreResultsAvailable: boolean;
    NextChunkStartPointer: number;
  }>('Orders', 'SalesOrderList', { RecordFetchLimit: 200, ...request }, options);

  return {
    orders: res.OrdersResponse?.dsOrdersResponse?.dtOrderResponse ?? [],
    moreAvailable: res.MoreResultsAvailable ?? false,
    nextPointer: res.NextChunkStartPointer ?? 0,
  };
}

export interface CreateSalesOrderRequest {
  CustomerID: string;
  ShipToSequence: number;
  SaleType: string;
  ExpectDate?: string;         // yyyy-mm-dd
  Reference?: string;
  ShipVia?: string;
  Driver?: string;
  Route?: string;
  SalesAgentID?: string;
  PONumber?: string;
  Notes?: string;
  Lines: {
    ItemID: string;
    Quantity: number;
    UOM: string;
    Price?: number;
    WarehouseID?: string;
  }[];
}

export interface CreateSalesOrderResult {
  NewOrderID?: number;  // Confirmed from Postman v619: SalesOrderCreate + QuoteCreate return NewOrderID
  ReturnCode: number;
  MessageText: string;
}

/**
 * Create a new sales order in the ERP.
 * Primary write path for converting a bid/takeoff into an actual SO.
 */
async function salesOrderCreate(
  request: CreateSalesOrderRequest,
  options: { branch?: string } = {}
): Promise<CreateSalesOrderResult> {
  const res = await callApi<CreateSalesOrderResult>('Orders', 'SalesOrderCreate', request, options);
  return res;
}

/**
 * Validate a sales order before creating it. Checks pricing, inventory, customer status.
 * Run this before salesOrderCreate to surface any issues to the user first.
 */
async function salesOrderCreateValidate(
  request: CreateSalesOrderRequest,
  options: { branch?: string } = {}
): Promise<{ valid: boolean; message: string }> {
  const res = await callApi<{ ReturnCode: number; MessageText: string }>(
    'Orders',
    'SalesOrderCreateValidate',
    request,
    options
  );
  return { valid: res.ReturnCode === 0, message: res.MessageText ?? '' };
}

/**
 * Cancel a sales order.
 */
async function salesOrderCancel(
  orderId: string,
  options: { branch?: string } = {}
): Promise<void> {
  await callApi('Orders', 'SalesOrderCancel', { OrderID: orderId }, options);
}

// ---------------------------------------------------------------------------
// Quote service
// ---------------------------------------------------------------------------

export interface CreateQuoteRequest {
  CustomerID: string;
  ShipToSequence: number;
  SaleType?: string;
  Reference?: string;
  ExpirationDate?: string;   // yyyy-mm-dd
  SalesAgentID?: string;
  Notes?: string;
  Lines: {
    ItemID: string;
    Quantity: number;
    UOM: string;
    Price?: number;
  }[];
}

export interface QuoteResult {
  NewOrderID?: number;  // Confirmed from Postman v619: QuoteCreate returns NewOrderID (same field as SalesOrderCreate)
  ReturnCode: number;
  MessageText: string;
}

/**
 * Create a quote in the ERP from a bid estimate.
 */
async function quoteCreate(
  request: CreateQuoteRequest,
  options: { branch?: string } = {}
): Promise<QuoteResult> {
  return callApi<QuoteResult>('Orders', 'QuoteCreate', request, options);
}

/**
 * Promote a quote to a sales order.
 */
async function quoteRelease(
  quoteId: string,
  options: { branch?: string } = {}
): Promise<CreateSalesOrderResult> {
  return callApi<CreateSalesOrderResult>(
    'Orders',
    'QuoteRelease',
    { QuoteID: quoteId },
    options
  );
}

// ---------------------------------------------------------------------------
// Purchasing service
// ---------------------------------------------------------------------------

export interface CreatePurchaseOrderRequest {
  SupplierID: string;
  SupplierShipFromSequence: number;
  ExpectDate?: string;        // yyyy-mm-dd
  Reference?: string;
  ShipToID?: string;
  Notes?: string;
  Lines: {
    ItemID: string;
    Quantity: number;
    UOM: string;
    Cost?: number;
    WarehouseID?: string;
  }[];
}

export interface CreatePurchaseOrderResult {
  PONumber: string;
  ReturnCode: number;
  MessageText: string;
}

/**
 * Create a purchase order in the ERP.
 */
async function purchaseOrderCreate(
  request: CreatePurchaseOrderRequest,
  options: { branch?: string } = {}
): Promise<CreatePurchaseOrderResult> {
  return callApi<CreatePurchaseOrderResult>('Purchasing', 'PurchaseOrderCreate', request, options);
}

/**
 * Get full detail for a purchase order (live, not from mirror table).
 */
async function purchaseOrderGet(
  poNumber: string,
  options: { branch?: string } = {}
): Promise<Record<string, unknown>> {
  return callApi('Purchasing', 'PurchaseOrderGet', { PONumber: poNumber }, options);
}

// ---------------------------------------------------------------------------
// Shipments service
// ---------------------------------------------------------------------------

export interface PickFileCreateRequest {
  OrderID: string;
  PickType?: string;
  PrintPickTicket?: boolean;
  WarehouseID?: string;
}

export interface PickFileCreateResult {
  PickFileID: string;
  ReturnCode: number;
  MessageText: string;
}

/**
 * Create a pick file in the ERP for a sales order.
 * Use this to initiate warehouse picking from the kiosk/app.
 */
async function pickFileCreate(
  request: PickFileCreateRequest,
  options: { branch?: string } = {}
): Promise<PickFileCreateResult> {
  return callApi<PickFileCreateResult>('Shipments', 'PickFileCreate', request, options);
}

/**
 * Record proof-of-delivery signature.
 */
export interface PODSignatureRequest {
  OrderID: string;
  ShipmentNum: number;
  SignatureName: string;
  SignatureData: string;  // base64 encoded image
  SignatureDate?: string; // yyyy-mm-dd, defaults to today
}

async function podSignatureCreate(
  request: PODSignatureRequest,
  options: { branch?: string } = {}
): Promise<void> {
  await callApi('Shipments', 'PODSignatureCreate', request, options);
}

/**
 * Update shipment status / info.
 * Use ShipmentStatusFlag "D" to mark a delivery as complete from the driver app.
 */
export interface ShipmentInfoUpdateRequest {
  OrderID: string | number;
  ShipmentNumber?: number;      // 0 = SO header; 1+ = specific shipment
  UpdateAllPickFiles?: boolean;
  UpdateSalesOrder?: boolean;
  ShipmentStatusFlag?: 'L' | 'S' | 'E' | 'D' | 'Loaded' | 'Staged' | 'En Route' | 'Delivered';
  RouteID?: string;
  StopNumber?: number;
  ShipDate?: string;           // yyyy-mm-dd
  RequestedDeliveryDate?: string;
}

async function shipmentInfoUpdate(
  request: ShipmentInfoUpdateRequest,
  options: { branch?: string } = {}
): Promise<void> {
  // API requires shipment fields nested inside ShipmentInfoRequestJSON dataset
  await callApi('Shipments', 'ShipmentInfoUpdate', {
    OrderID: Number(request.OrderID),
    ShipmentInfoRequestJSON: {
      dsShipInfoRequest: {
        dtShipInfoRequest: [
          {
            ShipmentNumber:          request.ShipmentNumber ?? 1,
            UpdateAllPickFiles:      request.UpdateAllPickFiles ?? true,
            UpdateSalesOrder:        request.UpdateSalesOrder ?? false,
            RouteID:                 request.RouteID ?? '',
            StopNumber:              request.StopNumber ?? 0,
            ShipDate:                request.ShipDate ?? '',
            RequestedDeliveryDate:   request.RequestedDeliveryDate ?? '',
            ShipmentStatusFlag:      request.ShipmentStatusFlag ?? '',
          },
        ],
      },
    },
  }, options);
}

/**
 * Get list of shipments with optional filters.
 */
export interface ShipmentsListRequest {
  OrderID?: string;
  StartDate?: string;
  EndDate?: string;
  RecordFetchLimit?: number;
  ChunkStartPointer?: number;
}

async function shipmentsList(
  request: ShipmentsListRequest = {},
  options: { branch?: string } = {}
): Promise<{ shipments: Record<string, unknown>[]; moreAvailable: boolean; nextPointer: number }> {
  const res = await callApi<{
    dsShipmentsList: { dtShipmentsList: Record<string, unknown>[] };
    MoreResultsAvailable: boolean;
    NextChunkStartPointer: number;
  }>('Shipments', 'ShipmentsList', { RecordFetchLimit: 200, ...request }, options);

  return {
    shipments: res.dsShipmentsList?.dtShipmentsList ?? [],
    moreAvailable: res.MoreResultsAvailable ?? false,
    nextPointer: res.NextChunkStartPointer ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Customer service
// ---------------------------------------------------------------------------

export interface CustomerListRequest {
  CustomerID?: string;
  RecordFetchLimit?: number;
  ChunkStartPointer?: number;
  FetchOnlyChangedSince?: string;
  ActiveOnly?: boolean;
}

async function customersList(
  request: CustomerListRequest = {},
  options: { branch?: string } = {}
): Promise<{ customers: Record<string, unknown>[]; moreAvailable: boolean; nextPointer: number }> {
  const res = await callApi<{
    dsCustomersList: { dtCustomersList: Record<string, unknown>[] };
    MoreResultsAvailable: boolean;
    NextChunkStartPointer: number;
  }>('Customer', 'CustomersList', { RecordFetchLimit: 200, ...request }, options);

  return {
    customers: res.dsCustomersList?.dtCustomersList ?? [],
    moreAvailable: res.MoreResultsAvailable ?? false,
    nextPointer: res.NextChunkStartPointer ?? 0,
  };
}

// ---------------------------------------------------------------------------
// AR service
// ---------------------------------------------------------------------------

/**
 * Get open AR activity for a customer (balance, open invoices).
 * Use this for the live AR balance on the customer profile page.
 */
async function customerOpenActivity(
  customerId: string,
  options: { branch?: string } = {}
): Promise<Record<string, unknown>> {
  return callApi('AccountsReceivable', 'CustomerOpenActivity', { CustomerID: customerId }, options);
}

/**
 * Get AR balances by bill-to customer.
 */
async function customerBilltoBalancesList(
  customerId: string,
  options: { branch?: string } = {}
): Promise<Record<string, unknown>> {
  return callApi('AccountsReceivable', 'CustomerBilltoBalancesList', { CustomerID: customerId }, options);
}

// ---------------------------------------------------------------------------
// Dispatch service
// ---------------------------------------------------------------------------

export interface DispatchGetRequest {
  DispatchDate?: string;   // yyyy-mm-dd, defaults to today
  RouteID?: string;
  OrderID?: string;
}

/**
 * Get dispatch information for a date/route/order.
 */
async function dispatchGet(
  request: DispatchGetRequest = {},
  options: { branch?: string } = {}
): Promise<Record<string, unknown>> {
  return callApi('Dispatch', 'DispatchGet', request, options);
}

// ---------------------------------------------------------------------------
// Utility: paginate through all records for a chunked list endpoint
// ---------------------------------------------------------------------------

/**
 * Iterate through all pages of a chunked Agility list endpoint.
 * Handles ChunkStartPointer / MoreResultsAvailable automatically.
 *
 * @param fetchPage - function that takes a ChunkStartPointer and returns { items, moreAvailable, nextPointer }
 * @param maxRecords - safety cap to avoid runaway loops (default 10,000)
 */
export async function paginateAll<T>(
  fetchPage: (pointer: number) => Promise<{ items: T[]; moreAvailable: boolean; nextPointer: number }>,
  maxRecords = 10_000
): Promise<T[]> {
  const all: T[] = [];
  let pointer = 0;

  while (true) {
    const { items, moreAvailable, nextPointer } = await fetchPage(pointer);
    all.push(...items);

    if (!moreAvailable || all.length >= maxRecords) break;
    pointer = nextPointer;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Types for BranchList
// ---------------------------------------------------------------------------

export interface BranchListItem {
  Branch: string;
  BranchName: string;
  Active: boolean;
}

// ---------------------------------------------------------------------------
// Main export — namespace object for clean import ergonomics
// ---------------------------------------------------------------------------

export const agilityApi = {
  // Session
  isConfigured: isAgilityConfigured,
  login,
  logout,
  fetchBranchList,
  fetchVersion,

  // Inventory
  itemPriceAndAvailability,
  itemsList,

  // Orders
  salesOrderList,
  salesOrderCreate,
  salesOrderCreateValidate,
  salesOrderCancel,

  // Quotes
  quoteCreate,
  quoteRelease,

  // Purchasing
  purchaseOrderCreate,
  purchaseOrderGet,

  // Shipments / Picks
  pickFileCreate,
  podSignatureCreate,
  shipmentInfoUpdate,
  shipmentsList,

  // Customers
  customersList,

  // AR
  customerOpenActivity,
  customerBilltoBalancesList,

  // Dispatch
  dispatchGet,

  // Low-level escape hatch — use for endpoints not yet wrapped above
  call: callApi,
};
