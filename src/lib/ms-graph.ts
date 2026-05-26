// Microsoft Graph API client.
//
// Uses the OAuth client-credentials flow (app-only auth — no signed-in user).
// The Entra app registration "LiveEdge Inbound Email" must have:
//   - Application permission: Mail.Read (admin-consented)
//   - Optionally an Exchange Online RBAC Application Access Policy or
//     RBAC-for-Applications role scoping the app to the credits@ mailbox only.
//
// Env vars required:
//   MS_GRAPH_TENANT_ID
//   MS_GRAPH_CLIENT_ID
//   MS_GRAPH_CLIENT_SECRET

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_BUFFER_MS = 60_000; // refresh 1 min before expiry

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getGraphToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_BUFFER_MS) {
    return cachedToken.value;
  }

  const tenantId     = process.env.MS_GRAPH_TENANT_ID;
  const clientId     = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET not set');
  }

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method:  'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph token request failed: ${res.status} ${err}`);
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value:     json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.value;
}

export async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getGraphToken();
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}

async function graphJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await graphFetch(path, init);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph ${init.method ?? 'GET'} ${path} failed: ${res.status} ${txt}`);
  }
  return res.json() as Promise<T>;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export type GraphMessage = {
  id:                  string;
  internetMessageId?:  string;
  subject?:            string | null;
  bodyPreview?:        string;
  body?:               { contentType: 'html' | 'text'; content: string };
  from?:               { emailAddress: { name?: string; address: string } };
  toRecipients?:       { emailAddress: { name?: string; address: string } }[];
  receivedDateTime?:   string;
  hasAttachments?:     boolean;
};

// Request the message in plain-text body to skip our own HTML stripping when possible.
// Outlook honors Prefer: outlook.body-content-type="text".
export async function getMessage(mailbox: string, messageId: string): Promise<GraphMessage> {
  return graphJson<GraphMessage>(
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`,
    { headers: { Prefer: 'outlook.body-content-type="text"' } },
  );
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export type GraphAttachmentBase = {
  id:                  string;
  name:                string;
  contentType:         string;
  size:                number;
  isInline:            boolean;
  contentId?:          string | null;
};

export type GraphFileAttachment = GraphAttachmentBase & {
  '@odata.type':       '#microsoft.graph.fileAttachment';
  contentBytes:        string; // base64
};

export type GraphItemAttachment = GraphAttachmentBase & {
  '@odata.type':       '#microsoft.graph.itemAttachment';
  item:                GraphMessage; // nested message
};

export type GraphReferenceAttachment = GraphAttachmentBase & {
  '@odata.type':       '#microsoft.graph.referenceAttachment';
};

export type GraphAttachment =
  | GraphFileAttachment
  | GraphItemAttachment
  | GraphReferenceAttachment;

export async function listAttachments(mailbox: string, messageId: string): Promise<GraphAttachment[]> {
  const json = await graphJson<{ value: GraphAttachment[] }>(
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`,
  );
  return json.value;
}

// Fetch an itemAttachment's nested message as raw RFC 822 (.eml) so we can run our
// existing nested-MIME walker. Graph exposes this via /$value on the attachment.
export async function getItemAttachmentRaw(
  mailbox: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const res = await graphFetch(
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
    `/attachments/${encodeURIComponent(attachmentId)}/$value`,
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph attachment $value fetch failed: ${res.status} ${txt}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ─── Subscriptions (change notifications) ────────────────────────────────────

export type GraphSubscription = {
  id:                  string;
  resource:            string;
  changeType:          string;
  notificationUrl:     string;
  expirationDateTime:  string;
  clientState?:        string;
};

export async function createSubscription(params: {
  resource:           string;     // e.g. /users/credits@beisserlumber.com/messages
  notificationUrl:    string;
  clientState:        string;     // verified on every notification
  expirationDateTime: string;     // ISO; max ~4230 minutes (≈ 70.5 h) for mail
  changeType?:        string;     // default 'created'
}): Promise<GraphSubscription> {
  return graphJson<GraphSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      changeType:         params.changeType ?? 'created',
      notificationUrl:    params.notificationUrl,
      resource:           params.resource,
      expirationDateTime: params.expirationDateTime,
      clientState:        params.clientState,
    }),
  });
}

export async function renewSubscription(id: string, expirationDateTime: string): Promise<GraphSubscription> {
  return graphJson<GraphSubscription>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ expirationDateTime }),
  });
}

export async function deleteSubscription(id: string): Promise<void> {
  const res = await graphFetch(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Graph DELETE subscription failed: ${res.status} ${txt}`);
  }
}

export async function listSubscriptions(): Promise<GraphSubscription[]> {
  const json = await graphJson<{ value: GraphSubscription[] }>('/subscriptions');
  return json.value;
}

// Mail subscriptions cap at 4230 minutes from Microsoft. Pick a safer 3-day window.
export function maxSubscriptionExpiration(): string {
  return new Date(Date.now() + 4230 * 60 * 1000).toISOString();
}
