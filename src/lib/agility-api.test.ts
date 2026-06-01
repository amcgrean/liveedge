import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// These tests cover the contracts the Agility API client guarantees:
// 1. salesOrderHeaderUpdate sends ONLY the minimal "change just CustomerPurchaseOrder"
//    payload — no line-item arrays — so a write can never clobber lines.
// 2. shipmentInfoUpdate wraps fields in the nested ShipmentInfoRequestJSON
//    dataset the DMSi API requires.
// 3. The session cache: one login per branch, reuse on the second call,
//    re-login on 401, and prod/test caches do not collide.
// 4. ReturnCode handling: 0/1 succeed (1 logs a warning); 2 throws AgilityApiError.
// 5. Missing env vars raise AgilityAuthError.
//
// We mock global.fetch and reset module state between tests so the in-memory
// session cache doesn't leak across cases.

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env = {
    ...ORIG_ENV,
    AGILITY_API_URL: 'https://prod.example.com/AgilityPublic/rest/',
    AGILITY_API_TEST_URL: 'https://test.example.com/AgilityPublic/rest/',
    AGILITY_USERNAME: 'leapi.beisser',
    AGILITY_PASSWORD: 'pw',
    AGILITY_BRANCH: '20GR',
  };
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

function makeFetchMock() {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  // queue of responses to return, in order. Each entry is what res.json() resolves to.
  const queue: Array<{ status?: number; body: unknown }> = [];

  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = queue.shift() ?? { status: 200, body: { response: { ReturnCode: 0, MessageText: 'ok' } } };
    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body),
    } as unknown as Response;
  });

  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    fetchMock,
    queue,
    pushLoginOk(contextId = 'ctx-1', initialBranch = '20GR') {
      queue.push({
        status: 200,
        body: {
          response: {
            SessionContextId: contextId,
            InitialBranch: initialBranch,
            ReturnCode: 0,
            MessageText: 'ok',
          },
        },
      });
    },
    pushResponse(body: unknown, status = 200) {
      queue.push({ status, body });
    },
  };
}

describe('salesOrderHeaderUpdate — minimal payload guarantee', () => {
  it('sends ONLY OrderID + CustomerPurchaseOrder, with NO line-item arrays', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'ok' } });

    const { agilityApi } = await import('./agility-api');

    const res = await agilityApi.salesOrderHeaderUpdate(123456, 'PO-NEW-1,WO-NEW-2');

    expect(res.ReturnCode).toBe(0);
    expect(env.calls).toHaveLength(2); // login + the update call
    const updateCall = env.calls[1];
    expect(updateCall.url).toBe('https://prod.example.com/AgilityPublic/rest/Orders/SalesOrderHeaderUpdate');

    const body = JSON.parse(String(updateCall.init?.body));
    // Payload is wrapped in { request: ... }
    expect(body).toHaveProperty('request');
    const req = body.request;

    // Required fields present
    expect(req.OrderID).toBe(123456);
    expect(req.OrderHeaderUpdateJSON.dsOrderHeaderUpdateRequest.dtOrderHeaderUpdateRequest).toEqual([
      { CustomerPurchaseOrder: 'PO-NEW-1,WO-NEW-2' },
    ]);

    // CRITICAL: line-item arrays MUST NOT be in the payload. If DMSi sees
    // these as empty arrays it could wipe line items on the SO. This is the
    // no-clobber guard the writeback design relies on.
    expect(req).not.toHaveProperty('dsOrderItemRequest');
    expect(req).not.toHaveProperty('dsOrderItemComponentRequest');

    // And nothing else — full keyset is exactly these two.
    expect(Object.keys(req).sort()).toEqual(['OrderHeaderUpdateJSON', 'OrderID']);
  });

  it('routes through AGILITY_API_TEST_URL when useTest=true', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'ok' } });

    const { agilityApi } = await import('./agility-api');
    await agilityApi.salesOrderHeaderUpdate(1, 'X', { useTest: true });

    expect(env.calls[0].url).toBe('https://test.example.com/AgilityPublic/rest/Session/Login');
    expect(env.calls[1].url).toBe('https://test.example.com/AgilityPublic/rest/Orders/SalesOrderHeaderUpdate');
  });
});

describe('shipmentInfoUpdate — nested-dataset payload shape', () => {
  it('wraps shipment fields inside ShipmentInfoRequestJSON.dsShipInfoRequest.dtShipInfoRequest[]', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'ok' } });

    const { agilityApi } = await import('./agility-api');
    await agilityApi.shipmentInfoUpdate({
      OrderID: 555,
      ShipmentStatusFlag: 'D',
      RouteID: 'R-1',
      StopNumber: 7,
      ShipDate: '2026-05-31',
    });

    const body = JSON.parse(String(env.calls[1].init?.body));
    const req = body.request;
    expect(req.OrderID).toBe(555);
    const inner = req.ShipmentInfoRequestJSON.dsShipInfoRequest.dtShipInfoRequest;
    expect(inner).toHaveLength(1);
    expect(inner[0]).toMatchObject({
      ShipmentNumber: 1,
      UpdateAllPickFiles: true,
      UpdateSalesOrder: false,
      RouteID: 'R-1',
      StopNumber: 7,
      ShipDate: '2026-05-31',
      ShipmentStatusFlag: 'D',
    });
  });

  it('coerces string OrderID to a number (Agility expects numeric)', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'ok' } });

    const { agilityApi } = await import('./agility-api');
    await agilityApi.shipmentInfoUpdate({ OrderID: '12345', ShipmentStatusFlag: 'D' });

    const body = JSON.parse(String(env.calls[1].init?.body));
    expect(body.request.OrderID).toBe(12345);
    expect(typeof body.request.OrderID).toBe('number');
  });
});

describe('session cache + auth', () => {
  it('only logs in once across multiple calls on the same branch', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'ok' } });
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'ok' } });

    const { agilityApi } = await import('./agility-api');
    // Pass an explicit branch so the cache key matches between
    // getSession (queries 'prod:20GR') and login (stores at 'prod:20GR').
    // With no branch, the cache silently misses every call — see
    // sessionCacheKey() inconsistency note in agility-api.ts.
    await agilityApi.salesOrderHeaderUpdate(1, 'X', { branch: '20GR' });
    await agilityApi.salesOrderHeaderUpdate(2, 'Y', { branch: '20GR' });

    // 1 login + 2 updates = 3 fetches, NOT 4
    expect(env.calls).toHaveLength(3);
    expect(env.calls[0].url).toContain('Session/Login');
    expect(env.calls[1].url).toContain('SalesOrderHeaderUpdate');
    expect(env.calls[2].url).toContain('SalesOrderHeaderUpdate');
  });

  it('re-logs in after a 401, then retries the same call', async () => {
    const env = makeFetchMock();
    env.pushLoginOk('ctx-1');
    env.pushResponse({ response: { ReturnCode: 0 } }, 401); // first call → expired token
    env.pushLoginOk('ctx-2');
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'ok' } });

    const { agilityApi } = await import('./agility-api');
    const res = await agilityApi.salesOrderHeaderUpdate(1, 'X', { branch: '20GR' });

    expect(res.ReturnCode).toBe(0);
    // 4 calls: login, attempt(401), re-login, retry
    expect(env.calls.map((c) => c.url)).toEqual([
      'https://prod.example.com/AgilityPublic/rest/Session/Login',
      'https://prod.example.com/AgilityPublic/rest/Orders/SalesOrderHeaderUpdate',
      'https://prod.example.com/AgilityPublic/rest/Session/Login',
      'https://prod.example.com/AgilityPublic/rest/Orders/SalesOrderHeaderUpdate',
    ]);
    // Second update uses the fresh ContextId
    expect(
      (env.calls[3].init?.headers as Record<string, string>).ContextId
    ).toBe('ctx-2');
  });

  it('prod and test sessions do NOT share cache', async () => {
    const env = makeFetchMock();
    // prod login + prod update
    env.pushLoginOk('prod-ctx');
    env.pushResponse({ response: { ReturnCode: 0 } });
    // separate test login + test update
    env.pushLoginOk('test-ctx');
    env.pushResponse({ response: { ReturnCode: 0 } });

    const { agilityApi } = await import('./agility-api');
    await agilityApi.salesOrderHeaderUpdate(1, 'X', { branch: '20GR' });
    await agilityApi.salesOrderHeaderUpdate(1, 'X', { branch: '20GR', useTest: true });

    // 2 logins (one per env) + 2 updates
    expect(env.calls.filter((c) => c.url.endsWith('/Session/Login'))).toHaveLength(2);
    expect(env.calls.filter((c) => c.url.endsWith('/SalesOrderHeaderUpdate'))).toHaveLength(2);
  });
});

describe('ReturnCode handling', () => {
  it('ReturnCode 0 resolves normally', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 0, MessageText: 'fine' } });

    const { agilityApi } = await import('./agility-api');
    const res = await agilityApi.salesOrderHeaderUpdate(1, 'X');
    expect(res.ReturnCode).toBe(0);
  });

  it('ReturnCode 1 is a warning — still resolves, log.warn invoked (writes to console.warn under the hood)', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 1, MessageText: 'check this' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { agilityApi } = await import('./agility-api');
    const res = await agilityApi.salesOrderHeaderUpdate(1, 'X');
    expect(res.ReturnCode).toBe(1);
    expect(warn).toHaveBeenCalled();
    // The structured logger emits a JSON line; the event name `agility.rc1`
    // should appear in it.
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('agility.rc1');
  });

  it('ReturnCode 2 throws AgilityApiError', async () => {
    const env = makeFetchMock();
    env.pushLoginOk();
    env.pushResponse({ response: { ReturnCode: 2, MessageText: 'bad order id' } });

    const { agilityApi, AgilityApiError } = await import('./agility-api');
    await expect(agilityApi.salesOrderHeaderUpdate(1, 'X')).rejects.toBeInstanceOf(
      AgilityApiError
    );
  });
});

describe('config / auth errors', () => {
  it('throws AgilityAuthError when AGILITY_USERNAME is missing', async () => {
    delete process.env.AGILITY_USERNAME;
    const { agilityApi, AgilityAuthError } = await import('./agility-api');
    await expect(agilityApi.salesOrderHeaderUpdate(1, 'X')).rejects.toBeInstanceOf(
      AgilityAuthError
    );
  });

  it('throws AgilityAuthError when Login returns non-zero ReturnCode', async () => {
    const env = makeFetchMock();
    // Login fails
    env.pushResponse({
      response: {
        SessionContextId: '',
        InitialBranch: '',
        ReturnCode: 2,
        MessageText: 'invalid credentials',
      },
    });

    const { agilityApi, AgilityAuthError } = await import('./agility-api');
    await expect(agilityApi.salesOrderHeaderUpdate(1, 'X')).rejects.toBeInstanceOf(
      AgilityAuthError
    );
  });

  it('isConfigured reflects env presence', async () => {
    const { agilityApi } = await import('./agility-api');
    expect(agilityApi.isConfigured()).toBe(true);
    delete process.env.AGILITY_PASSWORD;
    expect(agilityApi.isConfigured()).toBe(false);
  });
});
